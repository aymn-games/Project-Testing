/**
 * ==========================================================================
 *  AGP ELIMINATION ROULETTE — "روليت الإقصاء" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 *
 * لعبة أصلية (Native) داخل نفس مستودع Project-Testing — لا تحتاج نافذة
 * خارجية ولا postMessage إطلاقاً؛ صفحتها الخاصة
 * (games/elimination-roulette/index.html) تحمّل AGP Core كاملاً + هذا
 * الملف مباشرة.
 *
 * ⚠️ [0.44.0] تحديث تصميم شامل (جلسة تصميم كاملة اتُّفق عليها خطوة بخطوة
 *   قبل التنفيذ — راجع docs/CHANGELOG.md لتفاصيل كل نقطة). أبرز ما تغيّر:
 *   - عجلة حقيقية (Conic Gradient ملوَّنة بألوان المنصة الرسمية + حلقة
 *     مصابيح زخرفية)، بدل الدائرة الخطية البسيطة القديمة.
 *   - أسماء اللاعبين انتقلت لشريط منظّم أعلى العجلة (بدل توزيعها على
 *     محيط العجلة نفسها).
 *   - زر الدوران صار شعار "ألعاب أيمن" بمنتصف العجلة (بدل زر منفصل تحتها).
 *   - نوافذ الإقصاء/الإرجاع بحجم أكبر (1200×800)، بطاقات لاعبين جنباً
 *     لجنب بدون خلفية صف مستطيلة، اسم صاحب الدور بارز منفصل، موقّت أوضح
 *     وأكبر مع صوت تنبيه بآخر 10 ثوانٍ، وتبويب إعلان نتيجة منفصل (4 ثوانٍ
 *     + صوت) بعد كل اختيار.
 *   - نافذة الإرجاع بدون زر "تخطي" بالواجهة — التخطي عبر كتابة "تخطي"
 *     بالشات من صاحب الدور نفسه فقط.
 *   - "انعاش صديق": كل لاعب يترجَّع بهذي الطريقة **مرة واحدة فقط طول
 *     عمره بالمباراة** (يُستثنى من قوائم الإرجاع القادمة بعدها)، لا حد
 *     على عدد مرات تفعيل الآلية نفسها.
 *   - إصلاح فعلي لثغرة الحد الأقصى للاعبين: كان `AGP.lobby.close()` غير
 *     كافٍ وحده لوقف الانضمام الفعلي (مسار الكلمة المفتاحية الحقيقي —
 *     `agp-keyword-manager.js checkKeyword()` — لا يتحقق من حالة
 *     `AGP.lobby` إطلاقاً، فقط من علمه الداخلي `_active`)؛ الآن نستدعي
 *     أيضاً `AGP.keywordManager.deactivate()` صراحة عند الوصول للحد.
 *   - مزامنة حذف لاعب (زر 🗑️ الجديد بشاشة الإعدادات أثناء المباراة —
 *     js/agp-game-shell.js) مع حالة العجلة الداخلية هنا (`player:removed`).
 *   - نافذة اختيار هدية الإنعاش صارت تبويباً منبثقاً مبنياً بالكامل هنا
 *     (لا تعديل على نوع حقل عام جديد بـagp-game-shell.js اسمه
 *     'modal-trigger' — الشاشة العامة لا تعرف شيئاً عن الهدايا نفسها).
 *   - صوت للعجلة/الإقصاء/الإرجاع/التنبيه + حقل تحكم بمستوى الصوت
 *     بالإعدادات. ⚠️ ملاحظة صادقة: الأصوات الأربعة (spin/eliminate/revive/
 *     warning-beep) مُولَّدة برمجياً (نغمات بسيطة عبر Python/numpy)، مو
 *     مكتبة أصوات احترافية جاهزة — بديل عملي متاح فوراً، يمكن استبدالها
 *     بأي ملفات صوت حقيقية بنفس الأسماء بمجلد sounds/ وقتما تجهز.
 *   - تعديل الإعدادات أثناء المباراة (موقّت/هدية/عدد إنعاشات...) يُطبَّق
 *     فوراً على الدور القادم مباشرة — القراءة صارت حيّة من
 *     `AGP.gameShell.getSettings()` بدل نسخة مجمَّدة وقت بدء المباراة.
 *   - شاشة الفائز: بطاقة الفائز + بطاقة "الأكثر إقصاءً"، وزرّا "إعادة
 *     بنفس اللاعبين" (يتخطى الإعدادات واللوبي، يستبعد المحذوفين يدوياً
 *     تلقائياً) و"مباراة جديدة" (يحتفظ باليوزرنيم عبر AGP.storageManager
 *     — التعديل بـagp-game-shell.js).
 *   - نظام النقاط: **بدون أي تغيير** — التزام صريح بالنظام العام الموحّد
 *     للمنصة (+4 مشاركة/+20 فوز عبر window.AGPAuth.reportRoundCompletion)،
 *     بدون أي قيم مخصَّصة لهذي اللعبة (قرار صريح بالنقاش).
 *
 * الاعتماديات (بنفس ترتيب index.html القياسي، راجع docs/CLAUDE.md):
 *   js/agp-core.js … js/agp-bootstrap.js (AGP Core كامل)، ثم
 *   js/agp-player-card.js، ثم js/agp-game-shell.js (شاشة الإعدادات +
 *   الاتصال بتيك توك + اللوبي — ملف عام، مُعدَّل بنفس هذا الإصدار لكن
 *   يبقى عاماً قابلاً لإعادة الاستخدام)، ثم هذا الملف.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var GAME_ID = 'elimination-roulette';
    var GAME_NAME = 'روليت الإقصاء';
    var TIMER_NAME = 'elimination-roulette-turn';

    // ⚠️ [0.44.0] ألوان المنصة الرسمية — مطابقة تماماً لمتغيرات CSS
    // الجذرية بـindex.html (--accent/--accent-2/--accent-pink)، راجع
    // docs/UI_GUIDELINES.md. تُستخدَم بالعجلة والنوافذ بدل الألوان
    // اليدوية التقريبية القديمة.
    var C_ACCENT = '#7c3aed';   // بنفسجي أساسي
    var C_ACCENT2 = '#00c2ff';  // سماوي (لمسات محدودة عمداً)
    var C_PINK = '#ff4dff';     // وردي
    var C_ACCENT_LT = '#a78bfa';
    var C_PINK_LT = '#ff8de8';
    var C_ACCENT2_LT = '#7de0ff';

    // ⚠️ [0.45.0] نسخة غامقة من نفس ألوان العجلة أعلاه (لعجلة أغمق كما
    // طلب المستخدم) — كل لون = نفس اللون الأصلي بسطوع ~50%. راجع
    // docs/CHANGELOG.md للطريقة الحسابية.
    var C_ACCENT_DK = '#3e1d76';
    var C_ACCENT2_DK = '#00617f';
    var C_PINK_DK = '#7f267f';
    var C_ACCENT_LT_DK = '#53457d';
    var C_PINK_LT_DK = '#7f4674';
    var C_ACCENT2_LT_DK = '#3e707f';
    var WHEEL_PALETTE = [C_ACCENT_DK, C_PINK_DK, C_ACCENT2_DK, C_ACCENT_LT_DK, C_PINK_LT_DK, C_ACCENT2_LT_DK];

    // ⚠️ [0.45.0] لون العناصر الي كانت بيضاء فوق/داخل العجلة (حلقة
    // الحافة، السهم المؤشّر، حدود زر الدوران) — صار غامقاً بدل الأبيض
    // بناءً على طلب المستخدم، لكن مقصود يكون أفتح/مختلف عن ألوان العجلة
    // الغامقة أعلاه حتى يبقى مميّزاً وواضحاً فوقها (مو أسود بحت).
    var C_WHEEL_TRIM = '#9c8fb0';

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

    // ⚠️ [0.56.0] شكل الاختيار الثاني الاختياري — بكرة سكرول رأسية بدل
    // العجلة الدائرية (نفس نظام روليت الروسي rr-reel بالحرف). يبقى
    // كما هو عبر renderStage() المتكرّرة، بنفس فلسفة _wheelSizePx أعلاه.
    var _wheelDisplayMode = 'wheel'; // 'wheel' | 'reel'
    var REEL_ITEM_H = 150;
    var REEL_REPEATS = 6;

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

    // ⚠️ [0.66.0] مهلة إضافية قبل إعلان الفائز نهائياً عند آخر إقصاء ممكن
    // ينهي المباراة — تعطي فرصة حقيقية لهدية إنعاش "بالطريق" (وصلت فعلياً
    // من المُرسِل لكن لسا ما وصلت/انعالجت عندنا بسبب تأخير شبكة/تيك توك
    // طبيعي) تنقذ آخر لاعب مُقصى قبل ما تُقفَل المباراة. راجع تعليق
    // eliminatePlayer() أدناه للتفاصيل الكاملة.
    var FINAL_ELIMINATION_GIFT_GRACE_MS = 500;
    var _eliminationCounts = {}; // playerId (المُقصي) -> عدد من أقصاهم فعلياً
    // ⚠️ [0.46.0] حالة "العب" (الدوران التلقائي) — راجع handleAutoPlayToggle/maybeAutoSpin/stopAutoPlay.
    var _autoPlayActive = false;
    var _autoPlayTimer = null;
    // ⚠️ [0.61.0] رقم كل لاعب ثابت طول المباراة (يُحسب حسب ترتيب دخوله
    // للوبي عند بداية المباراة، أو ترتيب انضمامه وسط مباراة جارية) — راجع
    // assignPlayerNumber/playerNumber أدناه. يحل محل فهرس المصفوفة
    // المتغيّر (i+1) المستخدَم سابقاً بعرض ومطابقة رقم الشات بنافذتَي
    // الإقصاء/الإرجاع — كان يتغيّر كل جولة مع تقلّص _alive، فيصير الرقم
    // المكتوب بالشات لا يطابق شيء أو يطابق لاعباً مختلفاً عن المقصود.
    var _playerNumbers = {};       // playerId -> رقم ثابت
    var _nextPlayerNumber = 1;
    // ⚠️ [0.59.0] selectCandidateManually/_selectedCandidateIdx حُذفتا
    // بالكامل — راجع تعليق handleForceEliminateClick أدناه.

    // ⚠️ [0.59.0] معرِّف/كائن "المُقصي الافتراضي" لحالتَي إقصاء صاحب
    // الدور نفسه (الزر الأحمر، وانتهاء الوقت بسلوك "يُقصى صاحب الدور") —
    // بطلب صريح: تظهر بطاقة فعلية باسم "الاستريمر" بتبويب الإعلان بدل
    // الشكل القديم بلا بطاقة مُقصي إطلاقاً. ليس لاعباً حقيقياً، فما
    // يُحتسَب بإحصائية "الأكثر إقصاءً" (راجع eliminatePlayer أدناه).
    var STREAMER_ELIMINATOR_ID = '__streamer__';
    var STREAMER_VIRTUAL_PLAYER = { id: STREAMER_ELIMINATOR_ID, name: 'الاستريمر' };
    // ⚠️ [0.62.0] معرِّف setTimeout الخاص بإخفاء تبويب "عودة لاعب" تلقائياً
    // — راجع showReviveSplash() أدناه.
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
        _playerNumbers = {};
        _nextPlayerNumber = 1;
        if (_reviveSplashTimer) { window.clearTimeout(_reviveSplashTimer); _reviveSplashTimer = null; }
        var splashOverlay = el('er-revive-splash-overlay');
        if (splashOverlay) splashOverlay.style.display = 'none';
    }

    // ⚠️ [0.61.0] راجع تعليق _playerNumbers أعلاه — يُستدعى مرة واحدة فقط
    // لكل لاعب فعلياً (بداية المباراة بترتيب اللوبي، انضمام وسط مباراة،
    // أو "إعادة بنفس اللاعبين" بعد resetMatchState الذي يصفّر الجدول).
    function assignPlayerNumber(p) {
        if (!p || !p.id) return;
        if (_playerNumbers[p.id] == null) {
            _playerNumbers[p.id] = _nextPlayerNumber++;
        }
    }
    function playerNumber(p) { return (p && _playerNumbers[p.id]) || '?'; }

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
        if (el('er-zain-font-link')) return;
        var pre1 = document.createElement('link');
        pre1.rel = 'preconnect';
        pre1.href = 'https://fonts.googleapis.com';
        var pre2 = document.createElement('link');
        pre2.rel = 'preconnect';
        pre2.href = 'https://fonts.gstatic.com';
        pre2.crossOrigin = 'anonymous';
        var sheet = document.createElement('link');
        sheet.id = 'er-zain-font-link';
        sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=Zain:ital,wght@0,200;0,300;0,400;0,700;0,800;0,900;1,300;1,400&display=swap';
        document.head.appendChild(pre1);
        document.head.appendChild(pre2);
        document.head.appendChild(sheet);
    }

    // ⚠️ [0.51.0] خط "Tajawal" — طلب صريح بملف style.css مرجعي أرسله
    // المستخدم لشاشة الإعدادات الأولى تحديداً (family:'Tajawal'). يُحمَّل
    // بنفس أسلوب ensureZainFont أعلاه (حارس id يمنع التكرار، صفر لمس
    // للملف المشترك)، ويُطبَّق فقط على .er-settings-initial-box عبر CSS
    // (راجع injectStageStyles) — خط Zain الحالي يبقى كما هو لبقية شاشات
    // اللعبة (اللوبي، العجلة...إلخ)، خارج نطاق هذا التعديل.
    function ensureTajawalFont() {
        if (el('er-tajawal-font-link')) return;
        var pre1 = document.createElement('link');
        pre1.rel = 'preconnect';
        pre1.href = 'https://fonts.googleapis.com';
        var pre2 = document.createElement('link');
        pre2.rel = 'preconnect';
        pre2.href = 'https://fonts.gstatic.com';
        pre2.crossOrigin = 'anonymous';
        var sheet = document.createElement('link');
        sheet.id = 'er-tajawal-font-link';
        sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap';
        document.head.appendChild(pre1);
        document.head.appendChild(pre2);
        document.head.appendChild(sheet);
    }

    function injectStageStyles() {
        if (el('er-stage-styles')) return;
        ensureZainFont();
        ensureTajawalFont();
        var style = document.createElement('style');
        style.id = 'er-stage-styles';
        style.textContent = [
            ':root{--er-accent:' + C_ACCENT + ';--er-accent2:' + C_ACCENT2 + ';--er-pink:' + C_PINK + ';}',

            // ⚠️ [0.46.1] هامش body الافتراضي للمتصفح (8px) كان يسبب سكرول
            // صفحة بمقدار 16px حتى مع صندوق اللوبي المضبوط على 100vh.
            // هذا تصفير خاص بصفحة روليت الإقصاء فقط (الشيت هنا يُحقن فقط
            // عند تشغيل هذه اللعبة) — لا يمس أي ملف مشترك ولا أي لعبة ثانية.
            'html,body{margin:0 !important;padding:0 !important;}',

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
            '#agp-shell-overlay,#agp-shell-overlay *,#er-stage,#er-stage *,',
            '#er-modal-overlay,#er-modal-overlay *,#er-toast-wrap,#er-toast-wrap *,',
            '#er-event-log,#er-event-log *{font-family:"Zain",Cairo,sans-serif !important;}',

            '#er-stage{position:fixed;inset:0;padding-top:70px;display:flex;flex-direction:column;',
            'align-items:center;justify-content:flex-start;gap:14px;overflow-y:auto;font-family:Cairo,sans-serif;direction:rtl;color:#f3eefc;}',

            /* ---- [0.46.0] أسماء اللاعبين رجعت — لكن هذي المرة مكتوبة
             * مباشرة داخل كل قطعة من قطع العجلة نفسها (نص فقط، بدون أي
             * صور بروفايل)، بدل الشريط المنفصل القديم المُلغى بـ[0.45.0]. */
            '.er-wheel-label{position:absolute;top:50%;left:50%;transform-origin:center;',
            'font-size:0.68em;font-weight:800;color:#f1e9fb;text-shadow:0 1px 3px rgba(0,0,0,0.8);',
            'max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
            'pointer-events:none;text-align:center;}',

            /* ---- [0.48.0] موشر تكبير/تصغير العجلة — عنصر عادي بترتيب
             * العمود (#er-stage flex-direction:column) بين العجلة وزر
             * إعادة الترتيب العشوائي، حتى يتحرك الأخير تلقائياً معه لما
             * يتغيّر حجم العجلة فوقه (بدل التموضع المطلق). */
            '#er-wheel-zoom-row{display:flex;align-items:center;gap:10px;font-size:0.82em;color:#e9d3ff;}',
            '#er-wheel-zoom-slider{width:170px;accent-color:var(--er-accent2);cursor:pointer;}',

            /* ---- زر إعادة الترتيب العشوائي (تحت العجلة) ---- */
            '#er-shuffle-btn{margin-top:2px;padding:9px 22px;border-radius:999px;',
            'border:1px solid var(--er-accent2);background:rgba(255,255,255,0.08);color:#fff;',
            'font-family:inherit;font-weight:700;font-size:0.85em;cursor:pointer;}',
            '#er-shuffle-btn:disabled{opacity:0.4;cursor:not-allowed;}',
            '#er-shuffle-btn:not(:disabled):hover{background:rgba(255,255,255,0.16);}',

            /* ---- [0.61.0] الشكل الثاني الاختياري: بكرة سكرول رأسية بدل
             * العجلة — نفس نظام روليت الروسي (rr-reel) بالحرف، بألوان
             * روليت الإقصاء. الاختيار بينهما صار حقل إعدادات حقيقي
             * (wheelDisplayMode) بدل زر عائم فوق الشاشة — راجع
             * enhanceWheelModeField/setWheelDisplayMode. */
            '#er-reel-wrap{display:none;position:relative;width:min(560px,90vw);height:450px;',
            'max-height:70vh;',
            'margin:46px auto 0;border-radius:16px;background:rgba(0,0,0,0.35);',
            'border:2px solid var(--er-accent2);box-shadow:0 0 30px rgba(0,0,0,0.5);overflow:hidden;',
            'mask-image:linear-gradient(180deg,transparent 0%,#000 22%,#000 78%,transparent 100%);',
            '-webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 22%,#000 78%,transparent 100%);}',
            '#er-reel-list{position:absolute;left:0;right:0;top:0;',
            'transition:transform 3.8s cubic-bezier(0.15,0.85,0.25,1);}',
            '.er-reel-item{height:150px;display:flex;align-items:center;justify-content:center;gap:16px;',
            'padding:0 24px;box-sizing:border-box;}',
            '.er-reel-av{width:70px;height:70px;border-radius:50%;background:#241a2c;',
            'border:2px solid rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;',
            'font-weight:800;font-size:1.3em;color:#fff;flex:none;opacity:0.5;transition:opacity .2s;}',
            '.er-reel-name{font-size:1.4em;font-weight:800;color:#9d92b3;opacity:0.5;flex:1;overflow:hidden;',
            'text-overflow:ellipsis;white-space:nowrap;transition:opacity .2s,color .2s,font-size .2s;}',
            '.er-reel-num{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.1);',
            'color:#9d92b3;font-weight:900;font-size:1em;display:flex;align-items:center;justify-content:center;',
            'flex:none;opacity:0.5;transition:opacity .2s,background .2s,color .2s;}',
            '.er-reel-item.er-reel-highlight .er-reel-av{opacity:1;border-color:var(--er-accent2);}',
            '.er-reel-item.er-reel-highlight .er-reel-name{opacity:1;color:#fff;font-size:1.6em;}',
            '.er-reel-item.er-reel-highlight .er-reel-num{opacity:1;',
            'background:linear-gradient(90deg,var(--er-pink),var(--er-accent2));color:#150819;}',
            '#er-reel-pointer-line{position:absolute;top:150px;left:0;right:0;height:150px;',
            'pointer-events:none;border-top:2px solid var(--er-pink);border-bottom:2px solid var(--er-pink);',
            'background:linear-gradient(90deg,rgba(229,0,127,0.12),rgba(0,215,255,0.06));z-index:2;}',
            '#er-spin-hub.er-hub-standalone{position:static;transform:none;margin:14px auto 0;}',
            // ⚠️ [0.61.0] نص التوضيح تحت حقل "شكل عجلة الحظ" بشاشتَي
            // الإعدادات (الأولى والدرج) — عنصر عادي بتدفّق الصف، يُضاف
            // مرة واحدة عبر enhanceWheelModeField.
            '.er-field-note{font-size:0.72em;color:#9dd6c2;margin:-6px 0 4px;padding:0 2px;',
            'text-align:right;opacity:0.9;}',

            /* ---- [0.55.0] زر "العب التلقائي" — انتقل من داخل درج
             * الإعدادات (كان midMatchToggleButton بالملف المشترك) لتحت
             * العجلة مباشرة بشاشة اللعب، بطلب صريح. نفس منطق التفعيل/
             * الإيقاف (handleAutoPlayToggle) بلا أي تغيير، فقط مكان الزر. */
            '#er-autoplay-btn{margin-top:8px;padding:9px 22px;border-radius:999px;',
            'border:1px solid var(--er-accent2);background:rgba(255,255,255,0.08);color:#fff;',
            'font-family:inherit;font-weight:700;font-size:0.85em;cursor:pointer;}',
            '#er-autoplay-btn:hover{background:rgba(255,255,255,0.16);}',
            '#er-autoplay-btn.er-autoplay-active{background:linear-gradient(90deg,var(--er-accent2),var(--er-accent));',
            'border-color:transparent;color:#0b0616;font-weight:900;}',

            /* ---- العجلة الحقيقية (Conic Gradient + حلقة مصابيح) ----
             * ⚠️ [0.45.0] margin-top زاد من 8px لـ46px (نزول العجلة شوي
             * كما طلب المستخدم، تقريباً 1 سم — قياس تقريبي غير دقيق). */
            // ⚠️ [0.45.7] إصلاح خلل حقيقي: width وheight كانا يُحسَبان بصيغتين
            // منفصلتين (min(440px,88vw) لكل واحد) — عند مستويات تكبير معيّنة
            // بالمتصفح (Ctrl+، مثلاً 175%/200%) يحسبهما Chromium بقيمتين
            // مختلفتين فعلياً رغم تطابق الصيغة نصياً (خلل استُنسِخ وأُكِّد
            // فعلياً بمتصفح آلي)، فتصير العجلة بيضاوية بدل مربّعة. الحل:
            // width فقط عبر نفس الصيغة، وheight يُشتَق منها تلقائياً عبر
            // aspect-ratio:1 — قيمة واحدة محسوبة، صفر احتمال تباعد بينهما.
            '#er-wheel-wrap{position:relative;width:min(440px,88vw);aspect-ratio:1;margin-top:46px;}',
            '#er-wheel-bezel{position:absolute;inset:-14px;border-radius:50%;',
            'background:linear-gradient(135deg,var(--er-accent2),var(--er-accent),var(--er-pink));',
            'box-shadow:0 0 46px rgba(124,58,237,0.65),inset 0 0 0 6px rgba(156,143,176,0.25);}',
            '.er-bulb{position:absolute;width:9px;height:9px;border-radius:50%;background:#fff8dd;',
            'box-shadow:0 0 8px 2px rgba(255,244,180,0.85);}',
            /* ⚠️ [0.45.0] حلقة العجلة كانت بيضاء (rgba(255,255,255,0.92))
             * — صارت C_WHEEL_TRIM (غامقة لكن أفتح/مختلفة عن ألوان
             * العجلة الغامقة نفسها، حتى تبقى مميّزة فوقها). */
            '#er-wheel{position:absolute;inset:8px;border-radius:50%;border:5px solid ' + C_WHEEL_TRIM + ';',
            'transition:transform 3.2s cubic-bezier(0.15,0.85,0.25,1);box-shadow:inset 0 0 30px rgba(0,0,0,0.35);overflow:hidden;}',
            '#er-wheel-pointer{position:absolute;top:-20px;left:50%;transform:translateX(-50%);',
            'width:0;height:0;border-left:16px solid transparent;border-right:16px solid transparent;',
            'border-top:26px solid ' + C_WHEEL_TRIM + ';z-index:6;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));}',

            /* ---- محور المنتصف = زر الدوران (شعار + كلمة "دور") ---- */
            '#er-spin-hub{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:7;',
            'width:104px;height:104px;border-radius:50%;border:4px solid ' + C_WHEEL_TRIM + ';cursor:pointer;',
            'background:radial-gradient(circle at 35% 30%,#2a1443,#0e0e16);',
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;',
            'box-shadow:0 0 24px rgba(0,194,255,0.6),0 4px 10px rgba(0,0,0,0.5);padding:0;}',
            '#er-spin-hub img{width:44px;height:44px;object-fit:contain;border-radius:50%;}',
            '#er-spin-hub span{font-size:0.82em;font-weight:900;color:#fff;font-family:Almarai,Cairo,sans-serif;}',
            '#er-spin-hub:disabled{opacity:0.55;cursor:not-allowed;}',
            '#er-spin-hub:not(:disabled):hover{box-shadow:0 0 34px rgba(0,194,255,0.85),0 4px 14px rgba(0,0,0,0.5);}',

            /* ---- نافذة الدور (إقصاء/إرجاع) — 1300×800 ----
             * ⚠️ [0.45.0] عرّض من 1200 لـ1300، وصار بنفس تدريج/ألوان
             * صورة 4 (884B98 → 2D1932) بدل التدريج الفاتح القديم، والخط
             * أبيض بدل البنفسجي الغامق القديم. */
            // ⚠️ [0.46.0] flex-direction:column + gap: تسمح لبطاقة الاختيار
            // الجديدة (#er-modal-chooser-card) بالظهور فوق الصندوق كعنصر
            // شقيق منفصل بفاصل واضح (مو تراكب/overlap) — بدل التموضع
            // المطلق القديم.
            // ⚠️ [0.53.0] طلب صريح: الهيدر الثابت العلوي (#agp-persistent-header
            // بالملف المشترك js/agp-game-shell.js، z-index:99998) يبقى
            // ظاهراً دائماً فوق كل نوافذ اللعبة المنبثقة (الإقصاء/الإرجاع/
            // الإعلان/اختيار الهدية/شاشة الفائز) — بدل ما يختفي خلفها
            // (كان z-index هذا الصندوق 100010، أعلى من الهيدر، فيغطّيه/
            // يطمسه بالكامل خاصة بعد إضافة التغبيش بشاشة الفائز [0.52.0]).
            // خُفِّض هنا محلياً فقط (99990 — أقل من 99998) بدون أي لمس
            // للملف المشترك؛ يبقى أعلى من كل عناصر شاشة اللعب العادية.
            // ⚠️ يبقى شاشة الإعدادات/اللوبي (#agp-shell-overlay، z-index:99999
            // بالملف المشترك) تغطّي الهيدر كما هي — تلك خارج نطاق هذا
            // الإصلاح (لم يُطلَب صراحة تغيير سلوكها، وتغييرها يحتاج لمس
            // الملف المشترك).
            '#er-modal-overlay{position:fixed;inset:0;z-index:99990;display:none;flex-direction:column;',
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
            '#er-modal-box{width:1300px;max-width:97vw;height:auto;max-height:800px;max-height:min(800px,94vh);overflow-y:auto;box-sizing:border-box;',
            'background:linear-gradient(180deg,#5F3976,#211528);border:2px solid var(--er-accent);border-radius:20px;',
            'padding:28px 32px;color:#fff;box-shadow:0 0 50px rgba(124,58,237,0.55);}',
            '#er-modal-box h2{margin:0 0 6px;font-size:1.5em;text-align:center;color:#fff;font-weight:800;',
            'font-family:Almarai,Cairo,sans-serif;}',
            '#er-modal-sub{text-align:center;color:#e9d3ff;font-size:0.95em;margin-bottom:10px;}',

            /* ==================================================================
             * ⚠️ [0.61.0] نافذتا "اختيار الإقصاء" و"فرصة الإرجاع" — صندوق
             * جديد كلياً مستقل عن #er-modal-box القديم أعلاه (اللي بقي
             * الآن محصوراً بتبويبَي "إعلان النتيجة" و"شاشة الفائز" و"اختيار
             * هدية الإنعاش" فقط). التصميم منقول بالحرف من نافذة "مرحلة
             * الاختيار" بلعبة روليت الروسي (games/russian-roulette)، بطلب
             * صريح من صاحب المشروع، بألوان هوية روليت الإقصاء الخاصة بدل
             * الذهبي/البني الأصلي هناك. القديم (#er-modal-chooser-card +
             * chooserCardHtml + .er-chooser-actions/.er-candidate-* +
             * .er-phase-badge*) حُذف بالكامل — ما عاد يُستخدَم من أي مكان
             * (renderTurnModal الجديد أدناه لا يبنيه إطلاقاً). ---- */
            /* ================================================================
             * ⚠️ [0.58.0] شاشة اختيار الإقصاء/الإنعاش (نفس #er-select-box
             * المشتركة بين الحالتين عبر roleClass) — إزالة الصندوق
             * بالكامل بطلب صريح: العنوان/بطاقة صاحب الدور/الأزرار/
             * المؤقت/شبكة المرشّحين تطفو مباشرة فوق شاشة اللعب، بدل
             * صندوق 1150×700 بخلفية بنفسجية وحدّ ملوَّن. طبقة تعتيم 30%
             * (أسود شفاف) فوق شاشة اللعب الخلفية وتحت العناصر مباشرة —
             * تبقي شاشة اللعب ظاهرة خلفها بس تخلي البطاقات أوضح. تمييز
             * إقصاء/إنعاش الآن يعتمد بالكامل على ألوان العناصر الداخلية
             * (حلقة صاحب الدور، الأرقام، الكلمة الغامقة بالعنوان) بما إن
             * حدّ الصندوق الملوَّن نفسه اتشال.
             * ================================================================ */
            '#er-select-overlay{position:fixed;inset:0;z-index:99990;display:none;',
            'align-items:flex-start;justify-content:center;padding:0;}',
            '#er-select-overlay::before{content:"";position:fixed;inset:0;',
            'background:rgba(0,0,0,0.3);pointer-events:none;z-index:0;}',
            '#er-select-box{width:min(1150px,97vw);max-width:97vw;height:100vh;max-height:100vh;',
            'padding:90px 24px 24px;box-sizing:border-box;color:#fff;font-family:Almarai,Cairo,sans-serif;',
            'background:none;border:none;position:relative;overflow:hidden;box-shadow:none;',
            'display:flex;flex-direction:column;z-index:1;}',
            '#er-select-box > *{position:relative;z-index:1;}',
            '#er-select-title{text-align:center;font-size:0.95em;color:#d9c8e8;margin-bottom:18px;flex:none;',
            'text-shadow:0 2px 10px rgba(0,0,0,0.8);}',
            '#er-select-title b{color:var(--er-accent2);font-weight:900;}',
            // ⚠️ [0.62.0] عُكس اللون هنا عمداً (كان أخضر=إقصاء/أحمر=إنعاش)
            // ليطابق نظام الألوان الجديد لأرقام اللاعبين بنفس النافذتين
            // (أحمر=إقصاء، أخضر=إنعاش) — طلب صريح لتوحيد لغة الألوان.
            '#er-select-box.er-role-eliminate #er-select-title b{color:#ef4444;}',
            '#er-select-box.er-role-revive #er-select-title b{color:#22c55e;}',
            /* ---- صف واحد: بطاقة صاحب الدور المكبَّرة + الأزرار (متمركزان معاً) ---- */
            '#er-chooser-row{display:flex;align-items:center;justify-content:center;gap:26px;margin-bottom:12px;flex:none;}',
            '.er-select-chooser-card{display:flex;align-items:center;gap:12px;}',
            '.er-select-chooser-ring{width:88px;height:88px;border-radius:50%;padding:4px;box-sizing:border-box;flex:none;}',
            '.er-select-chooser-ring.er-role-eliminate{background:#22c55e;box-shadow:0 0 22px rgba(34,197,94,0.65);}',
            '.er-select-chooser-ring.er-role-revive{background:#ef4444;box-shadow:0 0 22px rgba(239,68,68,0.65);}',
            '.er-select-chooser-ring .er-ring-avatar,.er-select-chooser-ring .er-ring-avatar--fallback{width:100%;height:100%;font-size:1.5em;}',
            '.er-select-chooser-nmrow{display:flex;align-items:center;gap:10px;margin-top:1px;}',
            '.er-select-chooser-nm{font-size:1.35em;font-weight:900;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,0.8);}',
            // ⚠️ [0.62.0] كانت خلفية ثابتة (--er-accent2) بصرف النظر عن
            // النوع، وحجم 34px. طلب صريح جديد: تكبير بدرجة (34→42px) +
            // لون خلفية حسب النوع (أحمر=إقصاء، أخضر=إنعاش) بدل اللون
            // الثابت — راجع roleClass المُمرَّر بالـHTML بـselectChooserCardHtml.
            '.er-select-chooser-num{width:42px;height:42px;border-radius:50%;color:#fff;',
            'font-size:1.15em;font-weight:900;display:flex;align-items:center;justify-content:center;flex:none;}',
            '.er-select-chooser-num.er-role-eliminate{background:#ef4444;}',
            '.er-select-chooser-num.er-role-revive{background:#22c55e;}',
            '#er-select-actions{display:flex;flex-direction:row;gap:8px;width:230px;flex:none;}',
            '#er-select-actions button{flex:1;padding:9px 6px;border-radius:999px;border:none;font-weight:800;',
            'cursor:pointer;font-family:inherit;font-size:0.74em;color:#fff;white-space:nowrap;line-height:1.3;',
            'transition:transform 0.15s,box-shadow 0.15s;}',
            '#er-select-actions button:hover{transform:translateY(-2px);}',
            '#er-select-resume-btn{background:linear-gradient(90deg,var(--er-accent2),var(--er-accent));',
            'box-shadow:0 4px 14px rgba(124,58,237,0.45);}',
            '#er-force-eliminate-btn{background:linear-gradient(90deg,#ef4444,#b91c1c);',
            'box-shadow:0 4px 14px rgba(239,68,68,0.45);}',
            /* ---- المؤقّت — سطر مستقل بعد صف صاحب الدور، بارز وكبير ---- */
            '#er-select-timer{text-align:center;font-weight:900;font-size:1.5em;color:#ffe066;margin-bottom:10px;',
            'flex:none;transition:color 0.2s;text-shadow:0 2px 10px rgba(0,0,0,0.8);}',
            '#er-select-timer.er-timer-warning{color:#ff4d6d;animation:er-pulse 1s infinite;}',
            '@keyframes er-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.08);}}',
            /* ---- شبكة المرشّحين — ٤ أعمدة ثابتة، بطاقة لوبي-قياسي-v1
             * (تراكب أفاتار ٦٠px على لوح اسم دائري بمقدار ٢٢٪ تقريباً)،
             * الرقم الثابت جزء عادي من تدفّق لوح الاسم (مو موضع مطلق). ---- */
            '#er-select-candidates-grid{flex:1;min-height:0;overflow-y:auto;display:grid;',
            'grid-template-columns:repeat(4,1fr);gap:0.5cm;align-content:flex-start;padding:4px 2px 6px;',
            'width:min(900px,92vw);margin:0 auto;}',
            '.er-select-cand-card{display:flex;flex-direction:column;align-items:center;cursor:pointer;}',
            '.er-select-cand-row{display:inline-flex;align-items:center;}',
            '.er-select-cand-avatar{width:60px;height:60px;border-radius:50%;flex:none;position:relative;z-index:2;',
            'overflow:hidden;box-sizing:border-box;border:3px solid rgba(255,255,255,0.55);}',
            '.er-select-cand-avatar .er-ring-avatar,.er-select-cand-avatar .er-ring-avatar--fallback{width:100%;height:100%;font-size:1.1em;}',
            // ⚠️ [0.58.0] justify-content صار space-between بدل flex-start
            // (وشال gap) — طلب صريح: الرقم يبقى ثابتاً بنهاية حدود اللوح
            // دايماً (ملاصق الحافة الداخلية) بدل ما يطفو بمسافة متغيّرة
            // بعد الاسم مباشرة حسب طول الاسم.
            '.er-select-cand-plate{position:relative;height:48px;width:194px;box-sizing:border-box;',
            'margin-inline-start:-13px;padding-inline-start:31px;padding-inline-end:10px;',
            'display:flex;align-items:center;justify-content:space-between;font-weight:800;color:#fff;',
            'background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.3);backdrop-filter:blur(4px);',
            'border-radius:999px;overflow:hidden;z-index:1;}',
            '.er-select-cand-name{font-size:1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;}',
            // ⚠️ [0.62.0] تكبير بدرجة (32→40px) + لون خلفية أحمر بنافذة
            // الإقصاء (كان أخضر) وأخضر بنافذة الإنعاش (كان أزرق فاتح
            // --er-accent2) — طلب صريح جديد لتوحيد لغة الألوان بالنافذتين.
            '.er-select-cand-num{width:40px;height:40px;flex:none;color:#fff;',
            'border-radius:50%;font-size:1.2em;font-weight:900;',
            'display:flex;align-items:center;justify-content:center;z-index:3;}',
            '.er-select-cand-num.er-role-eliminate{background:#ef4444;}',
            '.er-select-cand-num.er-role-revive{background:#22c55e;}',
            '.er-select-cand-card.er-cand-selected .er-select-cand-plate{box-shadow:0 0 0 2px #ef4444;}',

            /* ---- تبويب إعلان النتيجة (4 ثوانٍ) ----
             * ⚠️ [0.44.0] إصلاح: كانت هذي القواعد مكتوبة بمُحدِّد ID
             * (#er-announce-box) بينما الكود يطبّقها فعلياً كـclassName
             * على نفس صندوق #er-modal-box (id يبقى er-modal-box دائماً) —
             * فما كانت تُطابَق إطلاقاً، وتبويب الإعلان كان يظهر بدون أي
             * تنسيق (نص متكدّس بالزاوية). صُححت لمحدِّدات class. */
            /* ⚠️ [0.45.0] ألوان الإعلان (كانت مصمَّمة لخلفية فاتحة) كُبِّرت
             * سطوعاً لتبقى مقروءة فوق الخلفية الغامقة الجديدة — تعديل
             * تقني ضروري للقراءة، مو مطلوباً صراحة بس لازم للتناسق. */
            /* ---- [0.46.0] إعادة تصميم كاملة لتبويب إعلان النتيجة —
             * صندوق صغير (~650×300) بجملة واحدة "اللاعب [أفاتار+اسم] قام
             * بإقصاء/بإرجاع [أفاتار+اسم]" بدل الأيقونة+العنوان+الاسم
             * الكبير القديم. تُستخدَم أيضاً بإعلان إنعاش "انعاش صديق". */
            // ⚠️ [0.55.0] طلب صريح جديد بجدول قياسات + SVG مرجعي دقيق —
            // يستبدل حجم/شكل [0.53.0] (كان 550×350 مطابقة تقريبية لروليت
            // الروسي): الحجم الآن 500×350 بالضبط (من الجدول: "الصندوق كامل
            // ⚠️ [0.57.0] طلب صريح جديد: خلفية الصندوق صارت شبه شفافة
            // (أبيض 15% شفافية بدل بنفسجي مصمَت #561972)، حدّ بنفسجي
            // شفاف 30% بدل بنفسجي غامق مصمَت، وزوايا مدببة أكثر (17px
            // بدل 12px). يستبدل [0.56.0] بالكامل على هذي الثلاث خصائص
            // فقط (عرض الحدّ 6px والأبعاد 500×350 بلا تغيير).
            '#er-modal-box.er-announce-box{width:500px;max-width:92vw;height:350px;max-height:90vh;',
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;',
            'padding:26px 24px;box-sizing:border-box;background:rgba(255,255,255,0.15);',
            'border:6px solid rgba(124,58,237,0.3);',
            'border-radius:17px;box-shadow:0 10px 30px rgba(0,0,0,0.5);}',
            '.er-announce-box .er-announce-sentence{font-size:1.25em;font-weight:800;text-align:center;',
            'line-height:2.4;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;}',
            // ⚠️ [0.55.0] العنوان صار جملة كاملة تتضمّن اسمَي الطرفين حرفياً
            // ("قام X بإقصاء Y بنجاح") — يستبدل عنوان [0.54.0] المختصر
            // ("🎯 إقصاء ناجح" بدون أسماء). حجم الخط قُلِّل قليلاً (1.15em
            // بدل 1.5em) لأن الجملة أطول بكثير الآن وتحتاج تلائم عرض
            // 500px بدون التفاف مبالغ فيه. راجع showResultAnnouncement().
            // ⚠️ [0.57.0] طلب صريح: الجملة صارت أعرض/أبرز — حجم الخط كبر
            // (1.35em بدل 1.15em) مع ظل مضاعف يبرزها أكثر فوق الخلفية
            // الشفافة الجديدة.
            '.er-announce-title{font-size:1.35em;font-weight:900;color:#fff;text-align:center;',
            'line-height:1.5;letter-spacing:0.3px;',
            'text-shadow:0 2px 8px rgba(0,0,0,0.4),0 0 1px #fff;}',
            '.er-announce-eliminate .er-announce-title{color:#ff8da3;}',
            '.er-announce-revive .er-announce-title{color:#7dffb0;}',
            // ⚠️ [0.57.0] فجوة الصف قلّت (30px بدل 50px) حتى تتّسع لإيموجي
            // الإقصاء الجديد (💀) بين البطاقتين — راجع showResultAnnouncement().
            '.er-announce-row{display:flex;align-items:center;justify-content:center;gap:30px;}',
            '.er-announce-vs-emoji{font-size:40px;align-self:center;',
            'filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5));}',
            // ⚠️ [0.55.0] بطاقة شخص واحدة (حلقة + وسم دور + اسم) — 145px
            // عرض ثابت حسب الجدول، 8px فاصل رأسي بين عناصرها الثلاثة.
            '.er-announce-person-card{width:145px;display:flex;flex-direction:column;',
            'align-items:center;gap:8px;}',
            // ⚠️ [0.55.0] حلقة 112px قطر — بنفس تقنية .er-ring-wrap/.er-ring-inner
            // المستخدمة ببطاقتَي شاشة الفائز (خلفية ملوَّنة + padding 5px
            // يُنتج سماكة الحلقة تلقائياً حول الصورة، بدل حدّ/stroke).
            '.er-announce-ring{width:112px;height:112px;border-radius:50%;padding:5px;box-sizing:border-box;}',
            '.er-announce-ring .er-ring-avatar,.er-announce-ring .er-ring-avatar--fallback{',
            'width:100%;height:100%;}',
            '.er-announce-ring-green{background:#22c55e;}',
            '.er-announce-ring-red{background:#ef4444;}',
            // تشبّع رمادي 60% (يبقى 40% من الألوان) + شفافية 0.9 — للطرف
            // "المُقصى" تحديداً، حسب الجدول.
            '.er-announce-ring-desaturate .er-ring-avatar,',
            '.er-announce-ring-desaturate .er-ring-avatar--fallback{filter:saturate(0.4);opacity:0.9;}',
            // ⚠️ [0.56.0] طلب صريح جديد: أنيميشن 3 ثوانٍ بالأحمر ثم اختفاء
            // لصورة اللاعب "المُقصى" تحديداً (نفس مدة عرض الصندوق قبل
            // إغلاقه التلقائي بـsetTimeout(...,3000) داخل
            // showResultAnnouncement() — الاختفاء يكتمل تماماً مع إغلاق
            // الصندوق). طُبِّق على حلقتَي الأحمر+التشبّع معاً (تركيبة
            // "المُقصى" الوحيدة في الكود حالياً) بدون التأثير على حلقة
            // الإرجاع الخضراء.
            '@keyframes er-announce-eliminate-glow{0%{box-shadow:0 0 0 0 rgba(239,68,68,0.65);}',
            '45%{box-shadow:0 0 26px 12px rgba(239,68,68,0.9);}',
            '100%{box-shadow:0 0 10px 3px rgba(239,68,68,0.15);}}',
            '.er-announce-ring-red{animation:er-announce-eliminate-glow 3s ease forwards;}',
            '@keyframes er-announce-eliminate-fade{0%{opacity:1;}55%{opacity:0.9;}100%{opacity:0;}}',
            '.er-announce-ring-desaturate .er-ring-avatar,',
            '.er-announce-ring-desaturate .er-ring-avatar--fallback{',
            'animation:er-announce-eliminate-fade 3s ease forwards;}',
            // ⚠️ [0.55.0] وسم الدور — كبسولة صغيرة تحت الحلقة مباشرة.
            '.er-announce-role-badge{padding:3px 12px;border-radius:999px;font-size:12px;',
            'font-weight:800;color:#fff;white-space:nowrap;}',
            '.er-announce-badge-green{background:#22c55e;}',
            '.er-announce-badge-red{background:#ef4444;}',
            // ⚠️ [0.54.0] كانت 0.55em (نسبية لسياق .er-announce-sentence
            // القديم بـfont-size:1.25em) — بعد حذف ذاك الغلاف صار حجم ثابت
            // صريح (14px) بدل نسبة قد تصغر بالخطأ بسياقها الجديد.
            // ⚠️ [0.55.0] أُضيف text-align:center — البطاقة صارت بعرض ثابت
            // 145px فقد الاسم قد يلتف لسطرين لو طويلاً.
            '.er-announce-person-name{font-size:14px;font-weight:800;color:#fff;text-align:center;}',
            // ⚠️ [0.55.0] .er-announce-person/.er-announce-avatar-wrap لم تعودا
            // مستخدَمتين من showResultAnnouncement() (استُبدلتا بـ
            // .er-announce-person-card/.er-announce-ring)، لكن أُبقيتا هنا
            // بدون حذف — كانت تُستخدَم أيضاً من showGiftReviveCard() (بطاقة
            // "إنعاش بالدعم" العائمة) ومن announcePersonHtml() القديمة.
            // ⚠️ [0.62.0] showGiftReviveCard() نفسها أُزيلت بهذا الإصدار
            // (استُبدلت بتبويب "عودة لاعب" الجديد — راجع showReviveSplash()
            // و#er-revive-splash-box أدناه)، فبقيت هاتان القاعدتان بلا أي
            // استخدام فعلي إلا عبر announcePersonHtml() غير المستخدَمة أصلاً
            // — أُبقيتا بلا حذف بنفس منطق الإبقاء السابق (صفر أثر جانبي).
            '.er-announce-person{display:inline-flex;flex-direction:column;align-items:center;gap:4px;',
            'vertical-align:middle;}',
            '.er-announce-avatar-wrap{display:block;width:106px;height:106px;border-radius:50%;position:relative;}',
            '.er-announce-avatar-wrap .er-ring-avatar,.er-announce-avatar-wrap .er-ring-avatar--fallback{',
            'width:106px;height:106px;}',
            /* تأثير أحمر خلف صورة المُقصى + تلاشي الصورة */
            '.er-announce-effect-red{box-shadow:0 0 0 6px rgba(255,77,109,0.25),0 0 30px 10px rgba(255,77,109,0.55);',
            'border-radius:50%;}',
            '@keyframes er-target-fadeout{0%{opacity:1;}60%{opacity:1;}100%{opacity:0.15;}}',
            '.er-announce-target-fadeout img,.er-announce-target-fadeout .er-ring-avatar--fallback{',
            'animation:er-target-fadeout 2.6s ease forwards;}',
            /* تأثير أخضر خلف صورة المُرجَع + تحوّل الحلقة من أحمر لأخضر */
            '.er-announce-effect-green{box-shadow:0 0 0 6px rgba(74,222,128,0.25),0 0 30px 10px rgba(74,222,128,0.55);',
            'border-radius:50%;}',
            '@keyframes er-target-revive-ring{0%{box-shadow:0 0 0 6px rgba(255,77,109,0.35),0 0 30px 10px rgba(255,77,109,0.5);}',
            '100%{box-shadow:0 0 0 6px rgba(74,222,128,0.25),0 0 30px 10px rgba(74,222,128,0.55);}}',
            '.er-announce-target-revive-ring{animation:er-target-revive-ring 1.6s ease forwards;}',

            /* ======================================================================
             *  [0.62.0] تبويب "عودة لاعب" — نافذة احتفالية موحَّدة تظهر وسط
             *  الشاشة فوق كل شيء (حتى فوق نافذة الاختيار المفتوحة، تماماً
             *  مثل بطاقة "إنعاش بالدعم" العائمة القديمة اللي كانت بنفس
             *  الغرض — راجع تعليق showReviveSplash() أدناه للسياق الكامل)،
             *  تحل محل كل من: (أ) الإشعار الصغير أسفل الشاشة عند الإنعاش
             *  بالدعم، (ب) تبويب "قام X بإرجاع Y" عند نجاح إنعاش صديق —
             *  طلب صريح جديد بتوحيد عرض أي إنعاش ناجح، بصرف النظر عن سببه،
             *  بنافذة واحدة جميلة بدل تصميمين مختلفين سابقاً.
             *  ⚠️ pointer-events:none على الغلاف بالكامل — تبويب معلوماتي
             *  بحت بدون أي زر، ولا يجوز أن يحجب النقر على أي عنصر تفاعلي
             *  تحته (نفس فلسفة toast/بطاقة الإنعاش العائمة القديمة تماماً).
             * ==================================================================== */
            '#er-revive-splash-overlay{position:fixed;inset:0;z-index:100030;display:none;',
            'align-items:center;justify-content:center;pointer-events:none;}',
            '#er-revive-splash-box{width:300px;height:300px;box-sizing:border-box;border-radius:24px;',
            'border:4px solid #22c55e;background:radial-gradient(circle at 50% 32%,rgba(34,197,94,0.28),rgba(10,20,14,0.94) 72%);',
            'box-shadow:0 0 60px rgba(34,197,94,0.65),0 20px 50px rgba(0,0,0,0.5);',
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;',
            'padding:18px;text-align:center;color:#fff;font-family:Almarai,Cairo,sans-serif;',
            'opacity:0;transform:scale(0.6);}',
            '#er-revive-splash-box.er-revive-splash-anim{animation:er-revive-pop 0.45s cubic-bezier(.34,1.56,.64,1) forwards;}',
            '@keyframes er-revive-pop{0%{opacity:0;transform:scale(0.5);}60%{opacity:1;transform:scale(1.08);}100%{opacity:1;transform:scale(1);}}',
            // ⚠️ [0.63.0] القلب صار صورة PNG مرفوعة من صاحب المشروع (بدل
            // إيموجي 💚 نصّي) — راجع revive-heart.png بجانب index.html
            // بنفس مجلد اللعبة، وHTML الجديد بترتيب: قلب، نص السبب،
            // صورة اللاعب، الاسم (بدل: قلب، صورة، اسم، سبب سابقاً) —
            // طلب صريح جديد بإعادة ترتيب المحتوى.
            '.er-revive-splash-heart{width:58px;height:58px;object-fit:contain;',
            'animation:er-revive-heartbeat 1s ease-in-out infinite;',
            'filter:drop-shadow(0 0 10px rgba(34,197,94,0.85));}',
            '@keyframes er-revive-heartbeat{0%,100%{transform:scale(1);}25%{transform:scale(1.18);}45%{transform:scale(0.96);}}',
            '.er-revive-splash-reason{font-size:0.82em;font-weight:700;color:#c9f7d8;line-height:1.4;}',
            '.er-revive-splash-avatar{width:92px;height:92px;border-radius:50%;border:3px solid #22c55e;',
            'box-shadow:0 0 18px rgba(34,197,94,0.6);overflow:hidden;flex:none;}',
            '.er-revive-splash-avatar .er-ring-avatar,.er-revive-splash-avatar .er-ring-avatar--fallback{',
            'width:100%;height:100%;font-size:1.6em;}',
            '.er-revive-splash-name{font-size:1.15em;font-weight:900;color:#fff;}',

            /* ---- Toasts ---- */
            '#er-toast-wrap{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100020;',
            'display:flex;flex-direction:column;gap:8px;align-items:center;}',
            '.er-toast{background:rgba(20,8,35,0.92);border:1px solid rgba(124,58,237,0.55);color:#f3eefc;',
            'padding:10px 18px;border-radius:999px;font-size:0.85em;font-weight:700;box-shadow:0 6px 16px rgba(0,0,0,0.35);}',

            /* ---- شاشة نهاية المباراة ----
             * ⚠️ [0.45.0] تصميم بطاقات جديد بالكامل (البطاقة القديمة
             * أُلغيت كلياً) — حلقة (ring) بسيطة حول الصورة الدائرية تناسب
             * اللعبة نفسها: حلقة "ذهبية دوّارة" للفائز (تلمّح لعجلة
             * الفوز)، وحلقة "متقطّعة وردية" لصاحب الأكثر إقصاءً (تلمّح
             * لعلامة استهداف/إقصاء) — بشارة أيقونة صغيرة فوق كل حلقة،
             * بنفس ألوان صورة 4. */
            /* ⚠️ [0.52.0] طلب صريح: شاشة الفائز بدون "لوح/تبويب" خلف
             * البطاقتين — الصندوق المشترك (#er-modal-box) يفقد خلفيته/حدّه/
             * ظلّه/حشوته هنا فقط (كلاس er-winner-panel، محدود بهذه الشاشة —
             * راجع renderWinnerScreen)، وخلفية الشاشة (اللي خلف الطبقة، أي
             * شاشة اللعب الفعلية) تصبح مغبّشة (backdrop-filter) بدل الطبقة
             * شبه المعتمة القديمة. بقية "تبويبات" اللعبة (نافذة الدور/
             * الإعلان/اختيار الهدية) تبقى بشكلها المصمَت القديم — الكلاسان
             * er-winner-panel/er-winner-backdrop يُزالان فوراً عند فتح أيٍّ
             * منها (راجع التعليقات المطابقة بتلك الدوال). */
            '#er-modal-overlay.er-winner-backdrop{background:rgba(8,4,16,0.38);',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}',
            '#er-modal-box.er-winner-panel{background:none;border:none;box-shadow:none;',
            'padding:0;width:auto;max-width:100%;overflow:visible;}',
            '#er-winner-box{text-align:center;}',
            '#er-winner-box h2{font-family:Almarai,Cairo,sans-serif;font-size:1.6em;color:#fff;',
            'text-shadow:0 2px 12px rgba(0,0,0,0.65);}',
            '.er-trophy-cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin:14px 0 18px;}',
            /* ⚠️ [0.46.0] حجم موحَّد 250×250 لكل بطاقة، وبدون أي خلفية أو
             * حدود إطلاقاً (أُلغيتا بالكامل) — تأثير "تطاير" (confetti)
             * هو البديل الاحتفالي الآن، راجع spawnConfetti().
             * ⚠️ [0.47.0] تأثير "إشعاع/توهّج" جديد حول كل بطاقة (نفس اللون
             * الموحَّد للطرفين — الفائز والأكثر إقصاءً — بطلب صريح)، مع
             * نبضة خفيفة مستمرة. overflow صار visible بدل hidden حتى لا
             * يُقصّ التوهّج (ولا قصاصات confetti التي تتخطى حدود الصندوق
             * أحياناً — إصلاح فني إضافي وُجد أثناء المراجعة).
             * ⚠️ [إصلاح مشترك] تصميم البطاقة نفسه (المستطيل 300×400
             * الزجاجي، الحلقة الملوَّنة، التاج، النقاط، إلخ) انتقل بالكامل
             * لملف مشترك (js/agp-player-card.js →
             * AGP.playerCard.renderTrophyCard) بطلب صريح من صاحب المشروع،
             * حتى تقدر أي لعبة ثانية تستخدم نفس التصميم بدون إعادة بنائه.
             * CSS البطاقة نفسها (.agp-trophy-*) لم يعد موجوداً هنا إطلاقاً
             * — راجع js/agp-player-card.js. بقيت هنا فقط CSS القطع
             * المحلية البحتة (خلفية الشاشة المغبّشة، صف البطاقات، أزرار
             * "إعادة/مباراة جديدة") + .er-ring-avatar/.er-ring-avatar--fallback
             * (لا تزالان مستخدَمتين محلياً بمكان آخر — إعلان الإقصاء/
             * الإرجاع وبطاقة الإنعاش العائمة، راجع ringAvatarHtml()). */
            '.er-ring-avatar{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#5a2585;display:block;}',
            '.er-ring-avatar--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#fff;font-weight:800;font-size:1.4em;}',

            '.er-winner-actions{display:flex;gap:10px;flex-wrap:wrap;}',
            '.er-btn-secondary{flex:1;min-width:180px;padding:12px;border-radius:999px;border:none;',
            'font-weight:800;cursor:pointer;font-family:inherit;font-size:0.95em;}',
            '#er-replay-same-btn{background:linear-gradient(90deg,var(--er-accent2),var(--er-accent));color:#0b0616;}',
            '#er-new-match-btn{background:#fff;border:1px solid var(--er-accent);color:#5a2585;}',

            /* ---- أزرار اختيار الهدية (أيقونة Twemoji + اسم + قيمة عملات) ---- */
            '.agp-pill-btn.er-gift-btn{display:inline-flex;flex-direction:column;align-items:center;',
            'justify-content:center;gap:3px;min-width:84px;margin:4px;padding:10px 8px;border-radius:14px;}',
            '.er-gift-icon{width:30px;height:30px;object-fit:contain;}',
            '.er-gift-name{font-size:0.82em;font-weight:700;}',
            '.er-gift-coins{font-size:0.72em;opacity:0.8;}',

            /* ---- [0.46.0] تأثير التطاير الاحتفالي (بطاقات شاشة الفائز) ---- */
            '.er-confetti-piece{position:absolute;top:50%;left:50%;width:8px;height:8px;border-radius:2px;',
            'pointer-events:none;opacity:0;animation:er-confetti-burst 1.4s ease-out forwards;}',
            '@keyframes er-confetti-burst{0%{opacity:1;transform:translate(-50%,-50%) translate(0,0) rotate(0deg);}',
            '100%{opacity:0;transform:translate(-50%,-50%) translate(var(--dx),var(--dy)) rotate(540deg);}}',

            /* ---- بانر أحداث المباراة (يسار الشاشة، من تحت الشعار) ----
             * ⚠️ [0.47.0] العرض صار 250px بدل 450px (طلب صريح).
             * ⚠️ [0.45.7] صار مخفياً افتراضياً (display:none) — يظهر فقط
             * بإضافة الكلاس er-log-visible (زر إظهار/إخفاء مخصَّص، راجع
             * ensureEventLog/#er-event-log-toggle أدناه). بما إنه
             * position:fixed أصلاً (خارج تخطيط #er-stage تماماً)، إخفاؤه/
             * إظهاره لا يحرّك ولا يزاحم أي عنصر بشاشة اللعب — طلب صريح. */
            '#er-event-log{position:fixed;left:0;top:70px;bottom:0;width:250px;max-width:90vw;',
            'box-sizing:border-box;padding:14px 16px;overflow-y:auto;background:rgba(12,6,22,0.55);',
            'border-inline-end:1px solid rgba(156,143,176,0.25);z-index:20;display:none;}',
            '#er-event-log.er-log-visible{display:block;}',
            '#er-event-log h3{margin:0 0 10px;font-size:0.95em;font-weight:800;color:#e9d3ff;}',
            '.er-event-log-item{display:flex;align-items:flex-start;gap:8px;font-size:0.82em;color:#f3eefc;',
            'background:rgba(255,255,255,0.05);border-radius:10px;padding:6px 10px;margin-bottom:6px;line-height:1.5;}',
            '.er-event-icon{flex-shrink:0;}',
            '#er-event-log-toggle{position:fixed;left:14px;top:78px;z-index:21;width:42px;height:42px;',
            'border-radius:50%;border:1px solid rgba(156,143,176,0.4);background:rgba(20,8,35,0.9);color:#e9d3ff;',
            'font-size:1.15em;cursor:pointer;display:flex;align-items:center;justify-content:center;',
            'box-shadow:0 4px 14px rgba(0,0,0,0.4);transition:background 0.15s,transform 0.15s;}',
            '#er-event-log-toggle:hover{background:rgba(124,58,237,0.35);transform:translateY(-1px);}',
            '#er-event-log-toggle.er-log-toggle-active{background:rgba(124,58,237,0.55);',
            'border-color:var(--er-accent2);}',

            /* ---- [0.45.7] تحسين بصري لمفتاحي تفعيل "انعاش صديق"/"الإنعاش
             * عن طريق الدعم" بشاشة الإعدادات — طلب صريح: الشكل بحالتي
             * التشغيل/الإيقاف "مو متناسق"، يحتاج يكون أوضح. تباين واضح
             * الآن: رمادي غامق مطفأ (OFF) ← أخضر متوهّج بارز (ON)، بدل
             * درجتي بنفسجي فاتح/غامق شبه متطابقتين سابقاً. محدود بصفحة
             * روليت الإقصاء فقط (!important + محدِّد خاص بمفتاحي هذي
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
             * المستخدم بـ#er-modal-box أعلاه — طلب صريح لتوحيد شكل كل
             * شاشات اللعبة. #agp-shell-box معرَّف أصلاً بالملف المشترك
             * js/agp-game-shell.js (تستخدمه كل الألعاب)، فبدل تعديله هناك
             * (يؤثر على كل لعبة)، هذا التنسيق محقون هنا فقط — يُحمَّل بعد
             * تنسيق الملف المشترك (registerGame تستدعي injectStageStyles
             * أول شيء)، بنفس محدِّد الـID + !important، فيطغى فقط على
             * صفحة روليت الإقصاء تحديداً دون أي تأثير على أي لعبة أخرى
             * تستخدم نفس الصندوق المشترك (لا تعديل بالملف المشترك نفسه إطلاقاً). */
            '#agp-shell-box{background:linear-gradient(180deg,#5F3976,#211528) !important;}',
            /* ⚠️ [0.54.0] لوبي بدون صندوق/تبويب خلفي — بطلب صريح: نفس
             * نموذج "lobby-no-box" المطبَّق حرفياً بروليت الروسي (منقول
             * أصلاً من روليت القبائل). العنوان/سطر التلميح/شبكة البطاقات/
             * الشريط السفلي تطفو مباشرة فوق خلفية الصفحة الكونية (الصندوق
             * نفسه بلا خلفية/حدود)، بدل التدرّج المصمت (5D336A→000000)
             * المستخدَم سابقاً. البنية الهيكلية (flex-column بارتفاع ثابت
             * + سكرول داخلي لشبكة البطاقات فقط — معيار
             * PLAYER-CARD-STANDARDS.md §4) بلا أي تغيير، فقط الخلفية/الحدود.
             */
            '#agp-shell-overlay:has(#agp-shell-box.agp-lobby-box){padding:0 !important;',
            'background:',
            'radial-gradient(ellipse 900px 500px at 50% -8%,rgba(229,0,127,0.12),transparent 60%),',
            'radial-gradient(ellipse 700px 500px at 90% 100%,rgba(0,215,255,0.10),transparent 60%),',
            'linear-gradient(180deg,#150819 0%,#0d0611 45%,#050208 100%) !important;}',
            '#agp-shell-box.agp-lobby-box{background:none !important;border:none !important;',
            'box-shadow:none !important;position:relative;overflow:hidden;}',

            /* ---- [0.45.12] تعديلات إضافية على صندوق الإعدادات/اللوبي
             * المشترك (#agp-shell-box) — كل القواعد هنا !important ومحقونة
             * من هذا الملف فقط (بعد تنسيق الملف المشترك)، فتطغى فقط على
             * صفحة روليت الإقصاء دون لمس js/agp-game-shell.js إطلاقاً. */

            // ⚠️ زر إغلاق الإعدادات (✕) كان بلون بنفسجي غامق (#5a2585) قليل
            // التباين — طلب صريح: يكون بارزاً وأبيض واضح.
            '#agp-settings-close-btn{color:#ffffff !important;font-weight:900 !important;',
            'text-shadow:0 1px 4px rgba(0,0,0,0.5) !important;}',

            // ⚠️ [0.46.1] معيار PLAYER-CARD-STANDARDS.md §4: الشاشة تبقى
            // ثابتة بدون أي سكرول على مستوى الصفحة/الصندوق نفسه — فقط
            // منطقة شبكة البطاقات (#agp-lobby-list) عندها سكرول داخلي،
            // ويتوقف دائماً قبل الشريط السفلي بغضّ النظر عن عدد اللاعبين.
            // يستبدل نظام [0.45.14]-[0.45.20] بالكامل (صندوق بارتفاع ثابت
            // 900px + تصغير تلقائي ديناميكي للبطاقات) — بدل تصغير البطاقات
            // نفسها، الصندوق صار flex عمودي: العناصر الثابتة (العنوان،
            // سطر التلميح، الشريط السفلي) بحجمها الطبيعي (flex:0 0 auto)،
            // وشبكة البطاقات وحدها تاخذ المساحة المتبقية وتسكرل لو لزم.
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
            '#er-lobby-watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
            'width:55%;max-width:420px;opacity:0.25;pointer-events:none;z-index:0;}',
            // العناصر الحقيقية بصندوق اللوبي فوق الشعار دائماً.
            '#agp-shell-box.agp-lobby-box > *:not(#er-lobby-watermark){position:relative;z-index:1;}',

            // ⚠️ [0.45.14] عنوان اللوبي بلونين — طلب صريح حسب تصميم
            // Figma: جزء أبيض ثابت + جزء ملوَّن مميَّز ("روليت الإقصاء")،
            // يستبدل تمييز اللون الذهبي الموحَّد المستخدَم سابقاً بـ[0.45.12].
            // النص نفسه (وليس فقط اللون) يتغيّر أيضاً — يُطبَّق عبر
            // enhanceLobbyHeading() (استبدال innerHTML لعنصر h2 الموجود
            // أصلاً بالملف المشترك، بدون أي تعديل على الملف نفسه).
            '#agp-shell-box.agp-lobby-box h2{text-shadow:none !important;letter-spacing:0.5px !important;}',
            '.er-lobby-title-plain{color:#fff !important;}',
            '.er-lobby-title-accent{color:#ffb648 !important;text-shadow:0 2px 10px rgba(255,182,72,0.4) !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint-text{color:#d9c8e8 !important;',
            'font-weight:400 !important;}',
            // إبراز إضافي لبادج الكلمة المفتاحية الجاهزة أصلاً بالملف
            // المشترك (.agp-join-keyword-badge) فوق الخلفية الغامقة الجديدة.
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge{box-shadow:0 0 22px rgba(0,194,255,0.75) !important;}',

            // ⚠️ [0.46.1] شارة عدد اللاعبين — PLAYER-CARD-STANDARDS.md §4:
            // "شارة عائمة أعلى الشاشة" بدل بقائها بنص سطر التلميح. العنصر
            // نفسه (#agp-lobby-count) موجود أصلاً بالملف المشترك ومُعبَّأ
            // تلقائياً (playerCountBadgeHtml)، هذا فقط يفصلها بصرياً
            // ويعوّمها أعلى يمين الصندوق بدل تدفقها العادي بالسطر.
            '#agp-shell-box.agp-lobby-box #agp-lobby-count{position:absolute !important;top:14px !important;',
            'left:20px !important;z-index:3 !important;}',
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge{background:rgba(0,0,0,0.45) !important;',
            'border:1px solid rgba(255,255,255,0.35) !important;border-radius:999px !important;',
            'padding:6px 16px !important;font-weight:900 !important;font-size:0.95em !important;',
            'box-shadow:0 4px 14px rgba(0,0,0,0.35) !important;}',

            /* ==================================================================
             * ⚠️ [0.54.0] رجوع مقصود عن قرار الحذف السابق [0.48.x] — بطلب
             * صريح جديد من صاحب المشروع: شبكة 5 أعمدة (بدل 4 الافتراضية
             * بالملف المشترك)، وحجم بطاقة 45px (بدل 60px الافتراضي)،
             * بفجوة متقاربة. هذا تخصيص محلي على حجم/شبكة البطاقات
             * (AGP.playerCard الافتراضي 60px يبقى بلا أي تعديل على الملف
             * المشترك نفسه — فقط override محلي بـ!important على أبعاد
             * العناصر المُولَّدة، بنفس صيغة الحساب الحقيقية بـ
             * js/agp-player-card.js لحجم 45px: pillW=145px، overlap=10px،
             * padStart=24px، padEnd=14px، ارتفاع اللوح=36px، خط=21px).
             * محدود بالكامل لسياق اللوبي (.agp-lobby-box) — صفر تأثير
             * على قائمة اللاعبين بشاشة الإعدادات وسط المباراة أو أي
             * استخدام آخر للبطاقة بهذا الملف.
             * ==================================================================== */
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{display:grid !important;',
            'grid-template-columns:repeat(5,1fr) !important;gap:10px 6px !important;',
            'justify-items:center !important;align-items:end !important;align-content:start !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-avatar-basic{width:45px !important;height:45px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-name-basic{width:145px !important;height:36px !important;',
            'margin-inline-start:-10px !important;padding-inline-start:24px !important;',
            'padding-inline-end:14px !important;font-size:21px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-avatar-basic--fallback{font-size:14px !important;}',
            // ⚠️ [تدقيق شامل] زر حذف اللاعب (🗑️) على البطاقات غير المؤطَّرة
            // كان بموضع الملف المشترك الافتراضي (top:-6px;left:-6px —
            // خارج حدود البطاقة تماماً)، يكسر التقارب مع البطاقات
            // المؤطَّرة المجاورة بشبكة 5 الأعمدة. صار بزاوية دائرة
            // الصورة (top:0;right:0)، داخل حدود البطاقة بالضبط، وأصغر
            // (16px بدل 20px) ليضمن يفضل داخل حدود دائرة 45px. محدود
            // صراحة بـ:has(> .agp-pcard) حتى ما يأثر على البطاقات
            // المؤطَّرة (.agp-pcard-tpl) إطلاقاً.
            '#agp-shell-box.agp-lobby-box li:has(> .agp-pcard) .agp-player-remove-btn{',
            'top:0 !important;left:auto !important;right:0 !important;',
            'width:16px !important;height:16px !important;font-size:9px !important;z-index:5;}',

            // ⚠️ [0.45.15] صف أزرار اللوبي السفلي — طلب صريح جديد: الثلاثة
            // أزرار (العودة للإعدادات، بدء الجولة، رجوع للمنصة) بصف واحد
            // جنب بعض، بنفس المقاس بالضبط (W360×H48)، بدل صفّين متفاوتَي
            // الحجم كما كان بـ[0.45.14]. المقاس ثابت (مو flex:1) + الصف
            // نفسه في المنتصف (justify-content:center).
            // ⚠️ [0.46.1] flex:0 0 auto — الصف يبقى بحجمه الطبيعي (شريط
            // سفلي ثابت) جوّا الصندوق اللي صار flex-column، ولا يتأثر
            // بمساحة القائمة القابلة للتمدد/السكرول فوقه.
            '#agp-shell-box.agp-lobby-box .er-lobby-actions-row{flex:0 0 auto !important;',
            'display:flex;gap:14px;margin-top:14px;justify-content:center;',
            'flex-wrap:wrap;}',
            '.er-lobby-actions-row > *{width:360px !important;height:48px !important;',
            'max-width:360px !important;flex:0 0 360px !important;box-sizing:border-box !important;',
            'display:flex !important;align-items:center !important;justify-content:center !important;',
            'padding:0 14px !important;margin:0 !important;}',
            '.er-lobby-back-settings-btn{border-radius:999px;',
            'border:1px solid rgba(255,255,255,0.35);background:rgba(255,255,255,0.08);color:#fff;',
            'font-family:inherit;font-weight:800;font-size:0.9em;cursor:pointer;transition:background 0.15s;}',
            '.er-lobby-back-settings-btn:hover{background:rgba(255,255,255,0.18);}',
            '#agp-shell-box.agp-lobby-box .er-lobby-actions-row #agp-start-round-btn{',
            'background:linear-gradient(90deg,#22c55e,#16a34a) !important;color:#fff !important;}',

            // ⚠️ زر "رجوع للمنصة" — طلب صريح [0.45.15]: بشاشة اللوبي صار
            // ضمن نفس صف الأزرار الثلاثة (W360×H48 موحَّد أعلاه)، بينما
            // بشاشة الإعدادات الأولى (صورة 1، خارج نطاق هذا التعديل) بقي
            // بشكله الأصلي (block بعرض تلقائي) — القاعدة العامة أدناه
            // تبقى الافتراضي، ومحدِّد .er-lobby-actions-row أعلى تخصيصاً
            // فيطغى فقط داخل صف اللوبي.
            '.er-back-to-platform-btn{display:block;margin:14px auto 0;padding:10px 22px;',
            'border-radius:999px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.08);',
            'color:#f3eefc;font-family:inherit;font-weight:800;font-size:0.9em;cursor:pointer;',
            'transition:background 0.15s;}',
            '.er-back-to-platform-btn:hover{background:rgba(255,255,255,0.18);}',

            /* ================================================================
             * ⚠️ [0.52.0] شاشة الإعدادات الأولى — استبدال تصميم [0.51.0]
             * (صندوق ثابت الحجم بتمرير داخلي وشريط سفلي) بنموذج
             * "settings-no-box" حرفياً، نفس النموذج المستخدَم بروليت
             * الروسي (منقول أصلاً من روليت القبائل): بدون أي صندوق/تبويب
             * يحيط الحقول — تخطيط عمودين (CSS Multi-column) طافٍ فوق
             * خلفية الصفحة الكونية مباشرة، عنوان كبير بتدرّج لوني بدل
             * لون مصمت، الحقول أبناء مباشرون للصندوق بلا wrapper (ما عدا
             * `.er-conditional-section` الذي يبقى — احتياج بصري/وظيفي
             * فعلي غير موجود بالملف المرجعي لروليت الروسي). الصفحة نفسها
             * (overlay) هي اللي تسكرول لو المحتوى طال، لا صندوق داخلي.
             * الألوان بقيت هوية روليت الإقصاء (وردي #E5007F/سماوي
             * #00D7FF) بدل الذهبي المستخدَم بروليت الروسي. محدود صراحة
             * بـ.er-settings-initial-box — صفر تأثير على شاشة الإعدادات
             * المعاد فتحها أثناء المباراة أو شاشة اللوبي.
             * ================================================================ */
            '#agp-shell-overlay:has(#agp-shell-box.er-settings-initial-box){padding:0 !important;',
            'align-items:flex-start !important;overflow-y:auto !important;',
            'background:',
            'radial-gradient(ellipse 900px 500px at 50% -8%,rgba(229,0,127,0.14),transparent 60%),',
            'radial-gradient(ellipse 700px 500px at 90% 100%,rgba(0,215,255,0.10),transparent 60%),',
            'linear-gradient(180deg,#150819 0%,#0d0611 45%,#050208 100%) !important;}',
            '#agp-shell-box.er-settings-initial-box{width:min(980px,94vw) !important;',
            'max-width:min(980px,94vw) !important;height:auto !important;max-height:none !important;',
            'overflow:visible !important;display:block !important;',
            'column-count:2 !important;column-gap:60px !important;column-fill:auto !important;',
            'background:none !important;border:none !important;border-radius:0 !important;',
            'box-shadow:none !important;padding:56px 24px 60px !important;box-sizing:border-box !important;',
            'margin:0 !important;font-family:"Tajawal",sans-serif !important;}',
            '#agp-shell-box.er-settings-initial-box *{font-family:"Tajawal",sans-serif !important;}',
            '#agp-shell-box.er-settings-initial-box > h2{column-span:all !important;margin:0 0 42px !important;',
            'max-width:none !important;font-size:clamp(24px,4vw,38px) !important;font-weight:900 !important;',
            'text-align:center !important;padding:0 0 20px !important;border-bottom:none !important;',
            'position:relative;',
            'background:linear-gradient(90deg,#E5007F,#f2cfe2 55%,#E5007F) !important;',
            '-webkit-background-clip:text !important;background-clip:text !important;',
            '-webkit-text-fill-color:transparent !important;}',
            '#agp-shell-box.er-settings-initial-box > h2::after{content:"";position:absolute;bottom:0;',
            'left:50%;transform:translateX(-50%);width:64px;height:3px;border-radius:3px;',
            'background:linear-gradient(90deg,transparent,#00D7FF,transparent);}',

            // .setting-row — صف موحَّد: نص يمين، قيمة يسار، فاصل تحتي رفيع
            // بدل خط تجميع كامل بمستوى القائمة (نفس منطق [0.51.0] السابق)،
            // مع break-inside:avoid حتى ما ينقسم الصف بين عمودين.
            '#agp-shell-box.er-settings-initial-box .agp-shell-field,',
            '#agp-shell-box.er-settings-initial-box .agp-shell-row{break-inside:avoid !important;',
            'padding:20px 0 !important;border-bottom:1px solid rgba(255,255,255,0.08) !important;',
            'max-width:none !important;margin:0 !important;display:flex !important;',
            'justify-content:space-between !important;align-items:center !important;width:100% !important;',
            'flex-wrap:wrap !important;}',
            '#agp-shell-box.er-settings-initial-box .agp-shell-field{flex-direction:column !important;',
            'align-items:flex-start !important;gap:10px !important;}',
            '#agp-shell-box.er-settings-initial-box .agp-shell-field label,',
            '#agp-shell-box.er-settings-initial-box .agp-shell-row-label{font-size:16px !important;',
            'font-weight:700 !important;color:#fff !important;text-align:right !important;}',

            // .custom-input (حقلا يوزرنيم/كلمة مفتاحية) — خط سفلي بدل صندوق
            // كامل، نفس فلسفة settings-no-box.
            '#agp-shell-box.er-settings-initial-box .agp-shell-field input[type=text]{',
            'max-width:none !important;width:100% !important;background:transparent !important;',
            'border:none !important;border-bottom:2px solid transparent !important;border-radius:0 !important;',
            'padding:4px 0 !important;font-size:1.25em !important;font-weight:700 !important;',
            'text-align:right !important;transition:border-color 0.2s;color:#fff;}',
            '#agp-shell-box.er-settings-initial-box .agp-shell-field input[type=text]:focus{',
            'border-bottom-color:#00D7FF !important;outline:none !important;}',

            // .gap-10 (صفوف الأزرار المتعددة)
            '#agp-shell-box.er-settings-initial-box .agp-pill-group{gap:10px !important;}',
            // .btn-toggle / .btn-toggle.active
            '#agp-shell-box.er-settings-initial-box .agp-pill-btn{background:transparent !important;',
            'border:1px solid rgba(255,255,255,0.18) !important;color:#d9a9c6 !important;',
            'padding:6px 16px !important;border-radius:999px !important;font-size:0.82em !important;',
            'font-weight:400 !important;transition:0.3s !important;white-space:nowrap;}',
            '#agp-shell-box.er-settings-initial-box .agp-pill-btn.agp-pill-active{',
            'background:linear-gradient(90deg,#E5007F,#00D7FF) !important;color:#150819 !important;',
            'border-color:transparent !important;}',

            // ⚠️ طلب سابق ثابت: صناديق الأرقام بدون أزرار +/− ظاهرة (مربع
            // رقم فاضي يُكتَب فيه مباشرة). الأزرار تبقى بالـDOM وتعمل
            // فعلياً (display:none فقط).
            '#agp-shell-box.er-settings-initial-box .agp-shell-counter-row button{display:none !important;}',
            '#agp-shell-box.er-settings-initial-box .agp-shell-counter-row{justify-content:flex-end !important;}',
            // .custom-input.small-input — دائرة ثابتة المقاس (نفس أسلوب
            // حقول الأرقام بروليت الروسي).
            '#agp-shell-box.er-settings-initial-box .agp-count-input{',
            'background:#150819 !important;border:1px solid rgba(0,215,255,0.4) !important;',
            'border-radius:50% !important;padding:0 !important;width:44px !important;height:44px !important;',
            'color:#fff !important;font-size:14px !important;font-weight:400 !important;outline:none !important;',
            'text-align:center !important;box-sizing:border-box !important;}',
            '#agp-shell-box.er-settings-initial-box .agp-count-input:focus{',
            'border-color:#00D7FF !important;box-shadow:0 0 8px rgba(0,215,255,0.4) !important;}',

            // .switch / .slider — مفتاح تشغيل/إيقاف "الإنعاش عن طريق
            // الدعم" (مسار رمادي #333، أخضر #25D366 عند التفعيل، مقبض
            // أبيض دائري) — بلا تغيير عن [0.51.0].
            '#agp-shell-box.er-settings-initial-box .agp-toggle-switch{width:50px !important;',
            'height:26px !important;}',
            '#agp-shell-box.er-settings-initial-box .agp-toggle-track{background:#333 !important;',
            'box-shadow:none !important;border-radius:34px !important;transition:0.4s !important;}',
            '#agp-shell-box.er-settings-initial-box .agp-toggle-track::before{background:#fff !important;',
            'box-shadow:none !important;width:18px !important;height:18px !important;left:4px !important;',
            'top:4px !important;border-radius:50% !important;transition:0.4s !important;}',
            '#agp-shell-box.er-settings-initial-box .agp-toggle-switch input:checked + .agp-toggle-track{',
            'background:#25D366 !important;}',
            '#agp-shell-box.er-settings-initial-box .agp-toggle-switch input:checked + .agp-toggle-track::before{',
            'transform:translateX(24px) !important;}',

            // .conditional-section — يلفّ صفّي "كم مرة مسموح له بالعودة"
            // و"اختار نوع الدعم" فقط (بدون صف التفعيل نفسه)، بخط تمييز
            // وردي على الحافة اليمنى. بقي كغلاف فعلي (خلاف روليت الروسي
            // اللي ما عنده حقل شبيه) — لازم break-inside:avoid حتى ما
            // ينقسم بين عمودين.
            '#agp-shell-box.er-settings-initial-box .er-conditional-section{display:flex !important;',
            'flex-direction:column !important;gap:18px !important;margin-top:14px !important;',
            'break-inside:avoid !important;',
            'border-right:2px solid #E5007F !important;padding-right:15px !important;}',
            '#agp-shell-box.er-settings-initial-box .er-conditional-section .agp-shell-row{',
            'border-bottom:none !important;padding:10px 0 !important;}',

            // .gift-box + .btn-gift.active — غلاف محلي (.er-gift-box-wrap)
            // حول زر اختيار الهدية (modal-trigger) نفسه؛ الآلية البرمجية
            // (نافذة منبثقة بكل الهدايا الحقيقية العشرين) بقيت كما هي
            // (طلب سابق صريح: "النافذة المنبثقة الحالية تكفي").
            '#agp-shell-box.er-settings-initial-box .er-gift-box-wrap{display:inline-flex !important;',
            'background:rgba(255,255,255,0.04) !important;padding:8px !important;',
            'border-radius:10px !important;border:1px solid rgba(0,215,255,0.3) !important;}',
            '#agp-shell-box.er-settings-initial-box .er-gift-box-wrap .agp-modal-trigger-btn{',
            'display:inline-flex !important;align-items:center !important;gap:6px !important;',
            'background:#E5007F !important;border:none !important;color:#fff !important;',
            'padding:6px 12px !important;border-radius:6px !important;font-size:13px !important;',
            'font-weight:400 !important;max-width:220px !important;overflow:hidden !important;',
            'text-overflow:ellipsis !important;white-space:nowrap !important;}',
            '#agp-shell-box.er-settings-initial-box .er-gift-name-icon{width:16px !important;',
            'height:16px !important;flex-shrink:0 !important;}',

            // زر الاتصال + رابط العودة — أبناء مباشرون للصندوق الآن (بدون
            // شريط سفلي منفصل)، مُمركَزان بعرض العمودين (column-span:all)
            // بنفس أسلوب settings-no-box.
            '#agp-shell-box.er-settings-initial-box .agp-shell-btn-connect{column-span:all !important;',
            'display:table !important;width:auto !important;max-width:none !important;',
            'margin:34px auto 0 !important;padding:16px 64px !important;background:#25D366 !important;',
            'color:#06170f !important;font-weight:900 !important;font-size:16px !important;',
            'border-radius:25px !important;letter-spacing:0.4px;position:relative;overflow:hidden;',
            'box-shadow:0 10px 34px rgba(37,211,102,0.4),0 0 0 1px rgba(255,255,255,0.15) inset !important;}',
            // ⚠️ [0.49.0] شريط "شيمر" خلف زر الاتصال — لا يزال مطلوباً، محفوظ كما هو.
            '#agp-shell-box.er-settings-initial-box .agp-shell-btn-connect::after{',
            'content:"";position:absolute;top:0;bottom:0;width:55%;left:-60%;',
            'background:linear-gradient(100deg,transparent,rgba(255,255,255,0.5),transparent);',
            'animation:er-connect-shimmer 2.6s ease-in-out infinite;pointer-events:none;}',
            '@keyframes er-connect-shimmer{0%{left:-60%;}55%{left:115%;}100%{left:115%;}}',
            // .back-link — نفس عنصر/دالة makeBackToPlatformBtn المشتركة مع
            // شاشة اللوبي بلا أي تعديل على onclick/homeNavigate؛ فقط نص
            // هذا العنصر بالذات (بعد إنشائه هنا) يُستبدَل محلياً — صفر
            // تأثير على شاشة اللوبي.
            '#agp-shell-box.er-settings-initial-box .er-back-to-platform-btn{column-span:all !important;',
            'display:table !important;width:auto !important;margin:14px auto 0 !important;',
            'padding:0 !important;border:none !important;background:transparent !important;',
            'font-size:14px !important;font-weight:400 !important;color:#fff !important;}',
            '#agp-shell-box.er-settings-initial-box .er-back-to-platform-btn:hover{',
            'color:#00D7FF !important;background:transparent !important;}',
            '@media (max-width:720px){#agp-shell-box.er-settings-initial-box{column-count:1 !important;}}',

            /* ================================================================
             * ⚠️ [0.53.0] طبقة الاتصال المخصَّصة (#er-conn-layer) — عنصر
             * منفصل تماماً عن #agp-shell-box، يُضاف مرة واحدة إلى body.
             * صندوق الاتصال/الخطأ الأصلي المشترك يُخفى بصرياً (لا يُحذف
             * ولا يُعدَّل — فقط visibility:hidden) لتفادي الازدواج مع
             * طبقتنا. راجع ensureConnLayer/showConnLayer/syncConnLayer.
             * ================================================================ */
            '#agp-shell-box.agp-connecting-box,#agp-shell-box.agp-conn-error{visibility:hidden !important;}',
            '#er-conn-layer{position:fixed;inset:0;z-index:100010;display:none;',
            'align-items:center;justify-content:center;}',
            '#er-conn-layer.show{display:flex;}',
            '#er-conn-layer .er-conn-backdrop{position:absolute;inset:0;overflow:hidden;',
            'filter:blur(6px) brightness(0.55);pointer-events:none;}',
            '#er-conn-layer .er-conn-backdrop > *{pointer-events:none !important;}',
            '#er-conn-layer .er-conn-modal{position:relative;z-index:1;width:min(340px,90vw);',
            'background:#1c0f26;border:1px solid rgba(0,215,255,0.25);border-radius:18px;',
            'padding:34px 24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);',
            'font-family:"Tajawal",sans-serif;}',
            '#er-conn-layer .er-conn-modal.er-conn-err{border-color:#ef4444;}',
            '#er-conn-layer::before{content:"";position:absolute;inset:0;background:rgba(5,2,8,0.45);}',
            '#er-conn-layer .er-conn-spinner{width:42px;height:42px;margin:0 auto 18px;',
            'border-radius:50%;border:4px solid rgba(255,255,255,0.15);border-top-color:#00D7FF;',
            'animation:er-conn-spin 0.9s linear infinite;}',
            '@keyframes er-conn-spin{to{transform:rotate(360deg);}}',
            '#er-conn-layer .er-conn-err-icon{width:42px;height:42px;margin:0 auto 18px;',
            'border-radius:50%;background:rgba(239,68,68,0.15);color:#ef4444;font-size:22px;',
            'font-weight:900;display:flex;align-items:center;justify-content:center;}',
            '#er-conn-layer .er-conn-title{margin:0 0 6px;font-size:18px;color:#fff;}',
            '#er-conn-layer .er-conn-modal.er-conn-err .er-conn-title{color:#ef4444;}',
            '#er-conn-layer .er-conn-sub{margin:0;font-size:13px;color:#cbb8d6;}',

            /* ================================================================
             * ⚠️ [0.55.0] درج إعدادات وسط المباراة — نفس نموذج روليت
             * الروسي/القبائل: ينزلق من يمين الشاشة، كامل الارتفاع، بدل
             * الصندوق المركزي. راجع enhanceReopenedDrawer أعلاه.
             * ================================================================ */
            '#agp-shell-overlay:has(#agp-shell-box.er-inmatch-drawer){align-items:stretch !important;',
            'justify-content:flex-end !important;padding:0 !important;}',
            '#agp-shell-box.er-inmatch-drawer{position:fixed !important;top:0 !important;right:0 !important;',
            'left:auto !important;width:400px !important;max-width:90vw !important;height:100vh !important;',
            'max-height:100vh !important;border-radius:0 !important;margin:0 !important;',
            'background:rgba(15,8,20,0.96) !important;border:none !important;',
            'border-inline-start:1px solid rgba(0,215,255,0.35) !important;display:flex !important;',
            'flex-direction:column !important;overflow:hidden !important;padding:0 !important;',
            'animation:er-drawer-in .3s cubic-bezier(0.32,0.72,0,1);}',
            '@keyframes er-drawer-in{from{transform:translateX(105%);}to{transform:translateX(0);}}',
            '.er-drawer-header{display:flex;align-items:center;justify-content:space-between;',
            'padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.08);flex:none;}',
            '.er-drawer-header h2{font-size:1em !important;font-weight:900;margin:0 !important;',
            'padding:0 !important;color:#fff;}',
            '.er-drawer-tabs{display:flex;gap:6px;padding:10px 18px 0;flex:none;}',
            '.er-drawer-tabs button{flex:1;padding:8px 0;border-radius:8px 8px 0 0;border:none;cursor:pointer;',
            'background:transparent;color:#d9a9c6;font-family:inherit;font-weight:800;font-size:0.82em;',
            'border-bottom:2px solid transparent;}',
            '.er-drawer-tabs button.er-tab-active{color:#fff;border-bottom-color:#00D7FF;',
            'background:rgba(229,0,127,0.08);}',
            '.er-drawer-body,.er-drawer-players-tab{flex:1;min-height:0;overflow-y:auto;padding:14px 18px 18px;}',
            '.er-drawer-body .agp-shell-row,.er-drawer-players-tab .agp-shell-row,',
            '.er-drawer-body .agp-shell-field,.er-drawer-players-tab .agp-shell-field{display:flex !important;',
            'align-items:center !important;justify-content:space-between !important;gap:10px;',
            'padding:12px 0 !important;border-bottom:1px solid rgba(255,255,255,0.07);margin:0 !important;}',
            '.er-drawer-body .agp-shell-row-label,.er-drawer-players-tab .agp-shell-row-label,',
            '.er-drawer-body .agp-shell-field label,.er-drawer-players-tab .agp-shell-field label{',
            'font-size:0.82em !important;color:#d9a9c6 !important;font-weight:700 !important;}',
            '#agp-shell-box.er-inmatch-drawer:not(.er-tab-players) .er-drawer-players-tab{display:none !important;}',
            '#agp-shell-box.er-inmatch-drawer.er-tab-players .er-drawer-body{display:none !important;}',
            // ⚠️ [0.60.0] حقل إدارة اللاعبين الجاهز من الملف المشترك يبقى
            // بتبويب الإعدادات (بدل نقله لتبويب اللاعبين) — نُخفي قائمته
            // الداخلية وعدّاده فقط، ونُبقي زر "➕ فتح دخول لاعبين جدد"
            // (بعد إعادة تسميته) ظاهراً بمكانه الأصلي بترتيب DOM.
            '#agp-shell-box.er-inmatch-drawer .agp-settings-player-box{display:none !important;}',
            '#agp-shell-box.er-inmatch-drawer .agp-settings-player-row{display:block !important;}',
            '#agp-shell-box.er-inmatch-drawer #agp-settings-player-count{display:none !important;}',
            '#agp-shell-box.er-inmatch-drawer .agp-shell-field:has(#agp-settings-player-count) > label{display:none !important;}',
            '#agp-shell-box.er-inmatch-drawer #agp-reopen-registration-btn{width:100% !important;',
            'margin-top:6px !important;border:1px dashed rgba(0,215,255,0.5) !important;',
            'background:rgba(0,215,255,0.08) !important;color:#cdeeff !important;}',
            // ---- تبويب اللاعبين المخصَّص (بحث + فلتر + قائمة موحَّدة) —
            // نفس نموذج روليت القبائل بالحرف، بألوان روليت الإقصاء. ----
            '#er-players-tab-search{width:100%;padding:8px 12px;border-radius:9px;',
            'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;',
            'font-family:inherit;font-size:0.8em;margin-bottom:10px;box-sizing:border-box;}',
            '#er-players-tab-filter{display:flex;gap:5px;margin-bottom:10px;}',
            '#er-players-tab-filter button{flex:1;padding:5px 2px;border-radius:7px;',
            'border:1px solid rgba(255,255,255,0.14);background:transparent;color:#d9a9c6;',
            'font-family:inherit;font-weight:800;font-size:0.68em;cursor:pointer;}',
            '#er-players-tab-filter button.er-filter-active{background:rgba(0,215,255,0.14);',
            'border-color:#00D7FF;color:#fff;}',
            '.er-prow{display:flex;align-items:center;gap:8px;padding:7px 0;',
            'border-bottom:1px solid rgba(255,255,255,0.05);}',
            '.er-prow.er-prow-out{opacity:0.6;}',
            '.er-prow .er-prow-avatar{width:26px;height:26px;border-radius:50%;flex:none;overflow:hidden;}',
            '.er-prow.er-prow-out .er-prow-avatar{filter:grayscale(1);}',
            '.er-prow .er-prow-avatar .er-ring-avatar,.er-prow .er-prow-avatar .er-ring-avatar--fallback{',
            'width:100%;height:100%;font-size:0.7em;}',
            '.er-prow .er-prow-name{flex:1;font-size:0.8em;font-weight:700;overflow:hidden;',
            'text-overflow:ellipsis;white-space:nowrap;}',
            '.er-prow .er-prow-status{font-size:0.6em;padding:2px 8px;border-radius:999px;font-weight:800;flex:none;}',
            '.er-prow .er-prow-status.er-status-live{background:rgba(34,197,94,0.15);color:#4ade80;',
            'border:1px solid rgba(74,222,128,0.4);}',
            '.er-prow .er-prow-status.er-status-out{background:rgba(239,68,68,0.15);color:#f87171;',
            'border:1px solid rgba(248,113,113,0.4);}',
            '.er-prow .er-prow-action{width:22px;height:22px;border-radius:50%;border:none;',
            'color:#fff;font-weight:900;font-size:0.65em;cursor:pointer;flex:none;}',
            '.er-prow .er-prow-action.er-action-eliminate{background:#ef4444;}',
            '.er-prow .er-prow-action.er-action-revive{background:linear-gradient(135deg,#22c55e,#16a34a);}',

            /* ================================================================
             * ⚠️ [0.55.0] نافذة "إضافة لوبي جديد" — 700×800، شفافية 70%،
             * حدود بلون واحد، شبكة 3 أعمدة ببطاقات 45px متقاربة (بلا فجوة
             * صف). راجع enhanceMiniLobby أعلاه.
             * ================================================================ */
            '#agp-shell-overlay:has(#agp-shell-box.er-mini-lobby-active){align-items:center !important;',
            'justify-content:center !important;background:rgba(5,3,10,0.55) !important;',
            'padding:0 !important;}',
            '#agp-shell-box.er-mini-lobby-active{width:700px !important;max-width:94vw !important;',
            'height:800px !important;max-height:92vh !important;margin:0 !important;',
            'padding:28px 26px 22px !important;box-sizing:border-box !important;',
            'display:flex !important;flex-direction:column !important;',
            'background:rgba(42,20,67,0.7) !important;backdrop-filter:blur(18px);',
            '-webkit-backdrop-filter:blur(18px);border:1.5px solid #E5007F !important;',
            'border-radius:22px !important;',
            'box-shadow:0 0 0 1px rgba(229,0,127,0.15),0 0 40px rgba(229,0,127,0.25),',
            '0 20px 60px rgba(0,0,0,0.5) !important;position:relative;overflow:hidden;}',
            '#agp-shell-box.er-mini-lobby-active h2{flex:none !important;text-align:center !important;',
            'font-size:1.35em !important;margin:0 0 12px !important;max-width:none !important;',
            'background:linear-gradient(90deg,#E5007F,#f2cfe2 55%,#E5007F) !important;',
            '-webkit-background-clip:text !important;background-clip:text !important;',
            '-webkit-text-fill-color:transparent !important;}',
            '.er-mini-lobby-close-btn{position:absolute;top:16px;left:16px;width:34px;height:34px;',
            'border-radius:50%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.18);',
            'color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;',
            'cursor:pointer;z-index:3;padding:0;font-family:inherit;}',
            '#agp-shell-box.er-mini-lobby-active .agp-join-hint{flex:none !important;text-align:center;',
            'display:flex !important;flex-direction:column !important;align-items:center !important;gap:8px;}',
            '#agp-shell-box.er-mini-lobby-active .agp-join-keyword-plain{display:inline-block;',
            'background:linear-gradient(90deg,#E5007F,#00D7FF);color:#150819;font-weight:900;',
            'padding:4px 16px;border-radius:999px;font-size:1.05em;letter-spacing:0.5px;}',
            '#agp-mini-lobby-count{display:block;color:#cbb8d6;font-size:0.75em;margin-top:4px;}',
            // شبكة اللاعبين — 3 أعمدة، بطاقات 45px (نفس صيغة الحساب الحقيقية
            // المستخدَمة بشبكة اللوبي أعلاه: لوح اسم 145px، تراكب 10px،
            // padStart=24px، padEnd=14px، ارتفاع=36px، خط=21px)، بلا فجوة صف.
            '#agp-shell-box.er-mini-lobby-active #agp-mini-lobby-list{',
            'flex:1 1 auto !important;min-height:0 !important;overflow-y:auto !important;',
            'display:grid !important;grid-template-columns:repeat(3,1fr) !important;',
            'gap:0px 10px !important;margin:16px 0 0 !important;padding:4px 4px 10px !important;',
            'list-style:none;}',
            '#agp-shell-box.er-mini-lobby-active #agp-mini-lobby-list li{position:relative;',
            'display:flex !important;align-items:center;justify-content:center;}',
            '#agp-shell-box.er-mini-lobby-active .agp-pcard-avatar-basic{width:45px !important;',
            'height:45px !important;flex-shrink:0;position:relative;z-index:2;}',
            '#agp-shell-box.er-mini-lobby-active .agp-pcard-name-basic{width:145px !important;',
            'height:36px !important;margin-inline-start:-10px !important;',
            'padding-inline-start:24px !important;padding-inline-end:14px !important;',
            'font-size:21px !important;}',
            '#agp-shell-box.er-mini-lobby-active #agp-mini-lobby-done-btn{flex:none !important;',
            'display:block !important;width:100% !important;margin:16px 0 0 !important;',
            'padding:14px 0 !important;font-size:0.95em !important;letter-spacing:0.4px;',
            'background:linear-gradient(90deg,#E5007F,#00D7FF) !important;color:#150819 !important;',
            'border:none !important;border-radius:999px !important;',
            'box-shadow:0 10px 26px rgba(229,0,127,0.3),0 0 0 1px rgba(255,255,255,0.15) inset !important;}'
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  3) شاشة العجلة الرئيسية
     * ==================================================================== */
    function ensureScaffolding() {
        injectStageStyles();
        if (!el('er-modal-overlay')) {
            var overlay = document.createElement('div');
            overlay.id = 'er-modal-overlay';
            overlay.innerHTML = '<div id="er-modal-chooser-card"></div><div id="er-modal-box"></div>';
            document.body.appendChild(overlay);
        }
        // ⚠️ [0.61.0] صندوق "اختيار الإقصاء/الإرجاع" الجديد — عنصر مستقل
        // كلياً عن #er-modal-overlay أعلاه (راجع تعليق CSS المفصَّل بأعلى
        // الملف). يُبنى هيكله مرة واحدة فقط هنا (نفس أسلوب #er-modal-overlay)،
        // ثم renderTurnModal() تحدّث محتوى #er-select-chooser-slot/
        // #er-select-candidates-grid فقط بكل فتحة دور — لا إعادة بناء كاملة
        // ولا إعادة ربط مستمعي الأزرار في كل مرة.
        if (!el('er-select-overlay')) {
            var selectOverlay = document.createElement('div');
            selectOverlay.id = 'er-select-overlay';
            selectOverlay.innerHTML =
                '<div id="er-select-box">' +
                    '<div id="er-select-title"></div>' +
                    '<div id="er-chooser-row">' +
                        '<div id="er-select-chooser-slot"></div>' +
                        '<div id="er-select-actions">' +
                            '<button id="er-force-eliminate-btn" type="button">❌ إقصاء صاحب الدور</button>' +
                            '<button id="er-select-resume-btn" type="button">▶️ استئناف اللعبة</button>' +
                        '</div>' +
                    '</div>' +
                    '<div id="er-select-timer"></div>' +
                    '<div id="er-select-candidates-grid"></div>' +
                '</div>';
            document.body.appendChild(selectOverlay);
            el('er-force-eliminate-btn').addEventListener('click', handleForceEliminateClick);
            el('er-select-resume-btn').addEventListener('click', handleSelectResumeClick);
        }
        if (!el('er-toast-wrap')) {
            var toastWrap = document.createElement('div');
            toastWrap.id = 'er-toast-wrap';
            document.body.appendChild(toastWrap);
        }
        // ⚠️ [0.62.0] تبويب "عودة لاعب" الجديد — راجع تعليق CSS المفصَّل
        // أعلى الملف وتعليق showReviveSplash() أدناه. عنصر مستقل تماماً،
        // يُبنى مرة واحدة فقط هنا بنفس أسلوب بقية عناصر ensureScaffolding().
        if (!el('er-revive-splash-overlay')) {
            var splashOverlay = document.createElement('div');
            splashOverlay.id = 'er-revive-splash-overlay';
            splashOverlay.innerHTML = '<div id="er-revive-splash-box"></div>';
            document.body.appendChild(splashOverlay);
        }
    }

    function renderStage() {
        ensureScaffolding();
        ensureEventLog();
        var stage = el('er-stage');
        if (!stage) {
            stage = document.createElement('div');
            stage.id = 'er-stage';
            document.body.appendChild(stage);
        }
        stage.innerHTML =
            '<div id="er-wheel-wrap">' +
            '<div id="er-wheel-bezel"></div>' +
            '<div id="er-wheel-pointer"></div>' +
            '<div id="er-wheel"></div>' +
            '<button id="er-spin-hub" title="دوّر العجلة"><img src="../../logo.png" alt="ألعاب أيمن"><span>دور</span></button>' +
            '</div>' +
            '<div id="er-reel-wrap">' +
            '<div id="er-reel-pointer-line"></div>' +
            '<div id="er-reel-list"></div>' +
            '</div>' +
            '<div id="er-wheel-zoom-row">' +
            '<span>🔍−</span>' +
            '<input type="range" id="er-wheel-zoom-slider" min="' + WHEEL_SIZE_MIN + '" max="' + WHEEL_SIZE_MAX + '" step="10" value="' + _wheelSizePx + '" title="تكبير/تصغير العجلة">' +
            '<span>🔍+</span>' +
            '</div>' +
            '<button id="er-shuffle-btn" type="button">🔀 إعادة ترتيب عشوائية</button>' +
            '<button id="er-autoplay-btn" type="button"></button>';

        applyWheelSize(_wheelSizePx);
        renderWheelBulbs();
        renderWheelSlices();
        renderWheelLabels();
        renderReel();
        el('er-spin-hub').onclick = handleSpinClick;
        el('er-shuffle-btn').onclick = handleShuffleClick;
        el('er-autoplay-btn').onclick = function () {
            handleAutoPlayToggle(!_autoPlayActive);
            updateAutoPlayBtnLabel();
        };
        updateAutoPlayBtnLabel();
        // ⚠️ [0.61.0] زر "🔃 تبديل شكل الاختيار" العائم فوق الشاشة أُزيل
        // بالكامل — شكل عجلة الحظ صار حقل إعدادات حقيقي (wheelDisplayMode
        // بـbuildSettingsFields) يظهر داخل درج الإعدادات، بدل زر مستقل.
        // الوضع المحفوظ (يبقى عبر renderStage() المتكرّرة، نفس فلسفة
        // _wheelSizePx) يُطبَّق هنا مباشرة عبر setWheelDisplayMode.
        var savedMode = _wheelDisplayMode;
        _wheelDisplayMode = 'wheel'; // الـDOM دايماً يبدأ بشكل العجلة الافتراضي
        if (savedMode === 'reel') setWheelDisplayMode('reel');
        el('er-wheel-zoom-slider').oninput = function () {
            handleWheelZoomChange(parseInt(this.value, 10));
        };
    }

    // ⚠️ [0.55.0] يحدّث نص/شكل زر "العب التلقائي" تحت العجلة حسب
    // _autoPlayActive الحالية — يُستدعى عند كل ضغطة على الزر نفسه، وعند
    // إيقاف التلقائي تلقائياً من مكان آخر (stopAutoPlay عند انتهاء/تصفير
    // المباراة) حتى ما يبقى الزر عالقاً على "إيقاف" بصرياً.
    function updateAutoPlayBtnLabel() {
        var btn = el('er-autoplay-btn');
        if (!btn) return;
        btn.classList.toggle('er-autoplay-active', _autoPlayActive);
        btn.textContent = _autoPlayActive ? '⏸️ إيقاف التلقائي' : '▶️ العب التلقائي';
    }

    /**
     * ⚠️ [0.48.0] يضبط حجم العجلة فعلياً (inline style، يتجاوز الحجم
     * الافتراضي بـCSS) + يحسب حداً آمناً بالنسبة لعرض الشاشة الحالي
     * (88vw، نفس سقف CSS الأصلي القديم) حتى ما تطفح العجلة خارج الشاشة
     * بشاشات صغيرة حتى لو الموشر مضبوط على قيمة أكبر.
     */
    function applyWheelSize(px) {
        var wrap = el('er-wheel-wrap');
        if (!wrap) return;
        var viewportSafeMax = Math.floor(window.innerWidth * 0.88);
        var applied = Math.max(WHEEL_SIZE_MIN, Math.min(px, viewportSafeMax));
        wrap.style.width = applied + 'px';
        wrap.style.height = applied + 'px';
    }

    function handleWheelZoomChange(px) {
        if (isNaN(px)) return;
        _wheelSizePx = Math.max(WHEEL_SIZE_MIN, Math.min(WHEEL_SIZE_MAX, px));
        applyWheelSize(_wheelSizePx);
        // ⚠️ نصف قطر أسماء اللاعبين على الشرائح يُحسَب من wheel.clientWidth
        // الفعلي (راجع renderWheelLabels) — لازم يُعاد حسابه هنا حتى
        // تتكيّف الأسماء فوراً مع الحجم الجديد.
        renderWheelLabels();
    }

    // ⚠️ حلقة "مصابيح" زخرفية ثابتة حول العجلة (16 نقطة) — تُبنى مرة
    // واحدة فقط (لا تعتمد على عدد اللاعبين).
    function renderWheelBulbs() {
        var bezel = el('er-wheel-bezel');
        if (!bezel || bezel.dataset.built) return;
        var n = 16;
        for (var i = 0; i < n; i++) {
            var angle = (360 / n) * i;
            var bulb = document.createElement('div');
            bulb.className = 'er-bulb';
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

    function renderWheelSlices() {
        var wheel = el('er-wheel');
        if (!wheel) return;
        var n = _alive.length;
        if (!n) { wheel.style.background = '#2a1443'; return; }
        var anglePer = 360 / n;
        var stops = [];
        for (var i = 0; i < n; i++) {
            var color = WHEEL_PALETTE[i % WHEEL_PALETTE.length];
            var from = (anglePer * i).toFixed(2);
            var to = (anglePer * (i + 1)).toFixed(2);
            stops.push(color + ' ' + from + 'deg ' + to + 'deg');
        }
        wheel.style.background = 'conic-gradient(' + stops.join(',') + ')';
    }

    // ⚠️ [0.46.0] اسم كل لاعب مكتوب داخل قطعته من العجلة مباشرة — تُبنى
    // كعناصر ابن داخل #er-wheel نفسه (بدل حاوية منفصلة) حتى تدور تلقائياً
    // مع دوران العجلة (transform:rotate() على العنصر الأب ينطبق تلقائياً
    // على كل أبنائه)، بنفس نمط التموضع الشعاعي المستخدَم بـrenderWheelBulbs().
    function renderWheelLabels() {
        var wheel = el('er-wheel');
        if (!wheel) return;
        wheel.querySelectorAll('.er-wheel-label').forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
        var n = _alive.length;
        if (!n) return;
        // ⚠️ الانتقال بنسبة مئوية (translate(0,-X%)) يُحسَب بالنسبة لحجم
        // العنصر نفسه (النص) لا بالنسبة لأبعاد العجلة — لو استُخدم هنا
        // كل الأسماء تتكدَّس بدائرة صغيرة جداً بمنتصف العجلة (خلف زر
        // الدوران، غير مرئية إطلاقاً). لذا نحسب نصف قطر فعلي بالبكسل من
        // أبعاد #er-wheel الحقيقية (clientWidth) بدل ذلك.
        var radiusPx = wheel.clientWidth ? (wheel.clientWidth / 2) * 0.62 : 130;
        var anglePer = 360 / n;
        _alive.forEach(function (p, i) {
            var angle = anglePer * i + anglePer / 2;
            var label = document.createElement('div');
            label.className = 'er-wheel-label';
            label.textContent = playerLabel(p);
            label.style.transform = 'translate(-50%,-50%) rotate(' + angle + 'deg) translate(0,-' + radiusPx.toFixed(1) + 'px)';
            wheel.appendChild(label);
        });
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
        var wheel = el('er-wheel');
        if (!wheel) return;
        wheel.style.transition = 'none';
        _wheelRotation = 0;
        wheel.style.transform = 'rotate(0deg)';
        void wheel.offsetWidth; // إجبار إعادة تدفّق حتى يُطبَّق transition:none فعلياً قبل إعادته
        wheel.style.transition = '';
    }

    function realignWheelAfterRosterChange() {
        renderWheelSlices();
        renderWheelLabels();
        resetWheelSpinPosition();
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
        var spinBtn = el('er-spin-hub');
        if (spinBtn && spinBtn.disabled) return; // العجلة تدور حالياً
        if (_alive.length < 2) return;
        shuffleArray(_alive);
        realignWheelAfterRosterChange();
    }

    function showToast(message) {
        var wrap = el('er-toast-wrap');
        if (!wrap) return;
        var t = document.createElement('div');
        t.className = 'er-toast';
        t.textContent = message;
        wrap.appendChild(t);
        window.setTimeout(function () {
            if (t.parentNode) t.parentNode.removeChild(t);
        }, 4000);
    }

    /* ======================================================================
     *  4) دوران العجلة
     * ==================================================================== */
    var _wheelRotation = 0;

    /**
     * ⚠️ [0.45.10] إصلاح خلل حقيقي مؤكَّد: توقّف السهم بصرياً على اسم
     * لاعب، بينما تبويب الاختيار يفتح لصاحب دور مختلف فعلياً (ملاحظة
     * وصلتنا من المستخدم مع صور من الموقع الحي).
     *
     * السبب الجذري: targetAngle أدناه يُحسَب دائماً بافتراض أن العجلة
     * حالياً واقفة عند 0deg بالضبط (زاوية الدوران الحالية = 0)، ثم
     * يُضاف فوق _wheelRotation المتراكم من كل الدورات السابقة. هذا
     * الافتراض صحيح فقط لو _wheelRotation صُفِّر فعلياً قبل هذه الدورة
     * (يحصل عند realignWheelAfterRosterChange بعد أي تغيير حقيقي
     * بالتشكيلة: إقصاء/إرجاع/انضمام/خلط). لكن 3 مسارات لإنهاء الدور
     * (زر "استئناف اللعب"، إعداد "يتخطى دوره فقط" عند انتهاء الوقت،
     * وانتهاء وقت نافذة الإرجاع بدون اختيار) كانت تُنهي الدور دون أي
     * تصفير للدوران رغم عدم تغيّر التشكيلة — فيبقى _wheelRotation من
     * الدورة السابقة، والحساب هنا يفترض خطأً أنه صفر، فتهبط العجلة
     * بصرياً على قطعة مختلفة تماماً عن winnerIndex الفعلي (المستخدَم
     * بشكل صحيح دائماً لتحديد صاحب الدور بالبيانات — لذلك تبويب الاختيار
     * نفسه كان يعرض الاسم الصحيح دائماً، فقط مكان توقف السهم بصرياً هو
     * الغلط). الإصلاح: استدعاء resetWheelSpinPosition() بكل المسارات
     * الثلاثة أيضاً (راجعها)، حتى تبدأ كل دورة فعلياً من صفر حقيقي.
     */
    function handleSpinClick() {
        if (!_matchActive || _pendingTurn) return;
        if (_alive.length <= 1) return;
        if (_wheelDisplayMode === 'reel') handleReelSpinClick();
        else handleWheelSpinClick();
    }

    function handleWheelSpinClick() {
        var spinBtn = el('er-spin-hub');
        if (spinBtn) spinBtn.disabled = true;
        playSound('spin');

        var winnerIndex = Math.floor(Math.random() * _alive.length);
        var winner = _alive[winnerIndex];

        var n = _alive.length;
        var anglePer = 360 / n;
        var targetAngle = 360 * 5 + (360 - (winnerIndex * anglePer + anglePer / 2));
        _wheelRotation += targetAngle; // يفترض _wheelRotation == 0 هنا (راجع التعليق أعلاه)

        var wheel = el('er-wheel');
        if (wheel) wheel.style.transform = 'rotate(' + _wheelRotation + 'deg)';

        window.setTimeout(function () {
            if (spinBtn) spinBtn.disabled = false;
            handleWheelLanded(winner);
        }, 3300);
    }

    // ⚠️ [0.56.0] نفس آلية بكرة السكرول الرأسية بروليت الروسي بالحرف
    // (renderReel/handleReelSpinClick هناك) — تنتهي بنفس handleWheelLanded
    // المشتركة مع نمط العجلة، فمنطق "وقفت العجلة عند..." (تكرار/انعاش
    // صديق/فتح نافذة الإقصاء) بلا أي تغيير بغضّ النظر عن الشكل المستخدَم.
    function renderReel() {
        var list = el('er-reel-list');
        if (!list || !_alive.length) return;
        var html = '';
        for (var r = 0; r < REEL_REPEATS; r++) {
            _alive.forEach(function (p, i) {
                html += '<div class="er-reel-item">' +
                    '<div class="er-reel-av">' + escapeHtml(playerLabel(p).slice(0, 1)) + '</div>' +
                    '<span class="er-reel-name">' + escapeHtml(playerLabel(p)) + '</span>' +
                    '<span class="er-reel-num">' + (i + 1) + '</span>' +
                '</div>';
            });
        }
        list.innerHTML = html;
        list.style.transitionDuration = '0ms';
        list.style.transform = 'translateY(0px)';
    }

    function handleReelSpinClick() {
        var spinBtn = el('er-spin-hub');
        if (spinBtn) spinBtn.disabled = true;
        playSound('spin');

        var winnerIndex = Math.floor(Math.random() * _alive.length);
        var winner = _alive[winnerIndex];
        var n = _alive.length;

        var list = el('er-reel-list');
        if (!list) { handleWheelLanded(winner); return; }
        list.style.transitionDuration = '0ms';
        list.style.transform = 'translateY(0px)';
        void list.offsetHeight;

        var targetRepeat = REEL_REPEATS - 1;
        var targetAbsoluteIndex = targetRepeat * n + winnerIndex;
        var viewportCenter = REEL_ITEM_H * 1.5;
        var translateY = -(targetAbsoluteIndex * REEL_ITEM_H) + viewportCenter - (REEL_ITEM_H / 2);

        list.style.transitionDuration = '3800ms';
        list.style.transform = 'translateY(' + translateY + 'px)';

        window.setTimeout(function () {
            if (spinBtn) spinBtn.disabled = false;
            var items = list.querySelectorAll('.er-reel-item');
            items.forEach(function (it) { it.classList.remove('er-reel-highlight'); });
            if (items[targetAbsoluteIndex]) items[targetAbsoluteIndex].classList.add('er-reel-highlight');
            handleWheelLanded(winner);
        }, 3800);
    }

    // ⚠️ [0.61.0] setWheelDisplayMode(mode) تستبدل handleDisplayModeToggle()
    // بالكامل — تُستدعى الآن من حقل الإعدادات الحقيقي wheelDisplayMode
    // (راجع enhanceWheelModeField أدناه)، بمعامل صريح ('wheel'|'reel')
    // بدل تبديل ثنائي، لأن مصدر الاستدعاء صار زرَّي pill-choice منفصلين
    // (مو زر واحد يقلب حالته). لا فحص _pendingTurn بعد الآن — بطلب صريح
    // "يطبَّق مباشرة عند اختيار أي خيار منهم" حتى أثناء دور مفتوح. زر
    // "العب التلقائي" (er-autoplay-btn) ثابت مكانه تحت أي من الشكلين
    // بلا أي تغيير على منطقه؛ فقط زر التدوير نفسه (er-spin-hub) ينتقل
    // فعلياً (نفس العنصر، مو نسخة) بين تحت العجلة وتحت البكرة.
    function setWheelDisplayMode(mode) {
        if (mode !== 'wheel' && mode !== 'reel') return;
        _wheelDisplayMode = mode;
        var wheelWrap = el('er-wheel-wrap');
        var reelWrap = el('er-reel-wrap');
        var hub = el('er-spin-hub');
        var zoomRow = el('er-wheel-zoom-row');
        // الشاشة لسا ما فُتحت (قبل بدء المباراة) — بس _wheelDisplayMode
        // اتسجّلت، وتُطبَّق تلقائياً أول ما renderStage() تشتغل.
        if (!wheelWrap || !reelWrap || !hub) return;

        if (mode === 'reel') {
            wheelWrap.style.display = 'none';
            if (zoomRow) zoomRow.style.display = 'none';
            reelWrap.style.display = 'block';
            renderReel();
            hub.classList.add('er-hub-standalone');
            reelWrap.insertAdjacentElement('afterend', hub);
        } else {
            wheelWrap.style.display = '';
            if (zoomRow) zoomRow.style.display = '';
            reelWrap.style.display = 'none';
            hub.classList.remove('er-hub-standalone');
            wheelWrap.appendChild(hub);
        }
    }

    // ⚠️ [0.61.0] حقل "🎡 شكل عجلة الحظ" (wheelDisplayMode) صار حقل
    // إعدادات حقيقي بـbuildSettingsFields — يظهر بشاشة الإعدادات الأولى
    // ودرج وسط المباراة معاً تلقائياً (نفس أي حقل pill-choice آخر). هذي
    // الدالة تضيف نص التوضيح تحته ("💡 السكرول خيار آمن") وتربط كل زر
    // pill بمستمع إضافي (addEventListener — لا يتعارض مع مستمع الملف
    // المشترك .onclick الذي يحفظ القيمة بـ_settingsValues فقط) يستدعي
    // setWheelDisplayMode() فوراً، بدل انتظار أول دوران جديد.
    function enhanceWheelModeField() {
        var box = el('agp-shell-box');
        if (!box) return;
        var pillBtns = box.querySelectorAll('[data-key="wheelDisplayMode"]');
        if (!pillBtns.length) return;
        var row = pillBtns[0].closest('.agp-shell-row');
        if (row && (!row.nextElementSibling || !row.nextElementSibling.classList.contains('er-field-note'))) {
            var note = document.createElement('div');
            note.className = 'er-field-note';
            note.textContent = '💡 السكرول خيار آمن';
            row.insertAdjacentElement('afterend', note);
        }
        pillBtns.forEach(function (btn) {
            // ⚠️ [تدقيق شامل] حارس ضد تكرار المستمع: أي حركة DOM ثانوية
            // داخل #agp-shell-overlay (مثلاً سحب شريط "مستوى الصوت" —
            // oninput بالملف المشترك يحدّث textContent مباشرة بدون إعادة
            // بناء كاملة) تُشغّل MutationObserver من جديد فتُعاد
            // enhanceWheelModeField() على نفس الأزرار الحيّة بلا تغيير —
            // بدون هذا الحارس كان كل سحبة بالسلايدر تضيف مستمع click
            // إضافي فوق نفس الزر (تراكم فعلي، مو تسريب ذاكرة خطير بس
            // استدعاءات مكرَّرة غير ضرورية لكل ضغطة مستقبلية).
            if (btn.getAttribute('data-er-wired') === '1') return;
            btn.setAttribute('data-er-wired', '1');
            btn.addEventListener('click', function () {
                setWheelDisplayMode(btn.getAttribute('data-value'));
            });
        });
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
        updateAutoPlayBtnLabel();
    }

    /* ======================================================================
     *  5) نافذة الإقصاء
     * ==================================================================== */
    function openEliminationWindow(chooser) {
        var candidates = _alive.filter(function (p) { return p.id !== chooser.id; });
        if (!candidates.length) return;

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
            // ⚠️ [0.59.0] كان chooser.id (بلا بطاقة مُقصي بتبويب الإعلان) —
            // صار STREAMER_ELIMINATOR_ID بطلب صريح، نفس أثر الزر الأحمر
            // بالضبط: يظهر "الاستريمر" كمُقصي فعلي بالتبويب.
            eliminatePlayer(chooser, STREAMER_ELIMINATOR_ID);
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

        // ⚠️ [0.59.0] "الاستريمر" (STREAMER_ELIMINATOR_ID) مستثنى من
        // إحصائية "الأكثر إقصاءً" — ليس لاعباً حقيقياً بالمباراة.
        if (eliminatorId && eliminatorId !== target.id && eliminatorId !== STREAMER_ELIMINATOR_ID) {
            _eliminationCounts[eliminatorId] = (_eliminationCounts[eliminatorId] || 0) + 1;
        }

        realignWheelAfterRosterChange();
        closeTurnModal();

        // ⚠️ [0.59.0] STREAMER_ELIMINATOR_ID يُحوَّل لبطاقة افتراضية فعلية
        // ("الاستريمر") بدل findPlayerByIdAnywhere العادية (ما يوجد
        // كلاعب حقيقي بأي مصفوفة).
        var eliminatorPlayer = eliminatorId === STREAMER_ELIMINATOR_ID
            ? STREAMER_VIRTUAL_PLAYER
            : (eliminatorId ? findPlayerByIdAnywhere(eliminatorId) : null);
        logEvent('eliminate', '❌ ' + playerLabel(target) + ' تم إقصاؤه' +
            (eliminatorPlayer && eliminatorPlayer.id !== target.id ? (' بواسطة ' + playerLabel(eliminatorPlayer)) : ''));

        showResultAnnouncement('eliminate', {
            target: target,
            chooser: (eliminatorPlayer && eliminatorPlayer.id !== target.id) ? eliminatorPlayer : null
        }, function onDone() {
            if (_alive.length <= 1) {
                // ⚠️ [0.66.0] هذا الإقصاء قد يكون الأخير (سينهي المباراة).
                // بدل إعلان الفائز فوراً، ننتظر FINAL_ELIMINATION_GIFT_GRACE_MS
                // إضافية أولاً — مستمع الهدايا (wireGiftListener) يبقى شغّالاً
                // طول هذي المهلة بلا أي تعديل عليه (المباراة لسا _matchActive
                // = true)، فلو وصلت هدية إنعاش صحيحة لنفس اللاعب المُقصى للتو
                // خلالها، revivePlayerByEntry الموجودة أصلاً ترجعه تلقائياً
                // لـ_alive. نعيد فحص _alive.length هنا بعد المهلة: لو رجع
                // لاعب، تكمل المباراة عادي (maybeAutoSpin) بدل إعلان فائز
                // خاطئ؛ لو لا، تُعلَن النتيجة كما كانت من قبل بالضبط.
                window.setTimeout(function () {
                    if (_alive.length <= 1) {
                        endMatch(_alive[0] || null);
                    } else {
                        maybeAutoSpin();
                    }
                }, FINAL_ELIMINATION_GIFT_GRACE_MS);
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

        // ⚠️ [0.62.0] راجع showReviveSplash() أدناه — استُبدل تبويب "قام X
        // بإرجاع Y" (بطاقتَي الشخصين، showResultAnnouncement('revive',...))
        // بتبويب "عودة لاعب" الموحَّد الجديد بطلب صريح. onDone (استمرار
        // الدوران التلقائي) بقي كما هو تماماً، فقط استُدعي من الدالة
        // الجديدة بدل القديمة.
        showReviveSplash(target, { reason: 'friend', chooser: chooserPlayer }, function onDone() {
            maybeAutoSpin();
        });
    }

    /* ======================================================================
     *  7) نافذة الدور المشتركة (إقصاء أو إرجاع) — عرض + عدّاد + استماع للشات
     *  ⚠️ [0.61.0] إعادة بناء كاملة — صندوق جديد (#er-select-overlay/box)
     *  منقول بالحرف من تصميم "مرحلة الاختيار" بروليت الروسي (بطلب صريح
     *  من صاحب المشروع)، يحل محل التصميم القديم لكلتا نافذتَي الإقصاء
     *  والإرجاع معاً. النقر على بطاقة مرشَّح بنافذة الإقصاء يُحدِّدها فقط
     *  (حدود حمراء + تفعيل نص الزر الأحمر) — الإقصاء الفعلي يصير بالزر.
     *  نافذة الإرجاع ما فيها زر أحمر إطلاقاً (ما فيه "هدف افتراضي" منطقي
     *  للإرجاع — طلب صريح): النقر على بطاقة مرشَّح يُرجعها فوراً، وزر
     *  "استئناف اللعبة" الوحيد يغلق بدون إرجاع أحد (نفس أثر كتابة "تخطي"
     *  بالشات، الموجودة من قبل ولم تتغيّر). ==================================================================== */
    function renderTurnModal() {
        ensureScaffolding();
        var overlay = el('er-select-overlay');
        var box = el('er-select-box');
        if (!overlay || !box || !_pendingTurn) return;

        var isRevive = _pendingTurn.type === 'revive';
        var roleClass = isRevive ? 'er-role-revive' : 'er-role-eliminate';
        box.className = roleClass;

        // ⚠️ [0.61.0] سطر علوي واحد مدمج بدون أي بادج منفصل — نفس صياغة
        // روليت الروسي بالحرف، بدون ذكر كلمة "إقصاء" (تنطبق على النافذتين
        // معاً). نافذة الإرجاع ما فيها زر أحمر (راجع تعليق الدالة أعلاه)،
        // فالجزء "من الأزرار تحت" غير دقيق لها — استُبدل بوصف يطابق آلية
        // النقر الفوري الفعلية بدل نسخ نص لا ينطبق تماماً.
        // ⚠️ [0.62.0] طلب صريح جديد: الكلمة العريضة صارت تُسمّي المرحلة
        // نفسها ("مرحلة الإقصاء"/"مرحلة الإنعاش") بدل الاسم العام "مرحلة
        // الاختيار" — لتوضيح فوري لنوع النافذة المفتوحة. لون الكلمة تبع
        // نفس نظام الأحمر=إقصاء/أخضر=إنعاش الجديد (راجع #er-select-title b
        // بالـCSS أعلاه، بُدِّل من الأخضر/الأحمر المعاكس السابق).
        var titleLine = isRevive
            ? '<b>مرحلة الإنعاش</b> — اختر من الشات بكتابة الرقم، أو يدوياً بالنقر على بطاقة اللاعب'
            : '<b>مرحلة الإقصاء</b> — اختر من الشات بكتابة الرقم، أو يدوياً من الأزرار تحت';
        el('er-select-title').innerHTML = titleLine;

        el('er-select-chooser-slot').innerHTML = selectChooserCardHtml(_pendingTurn.chooser, roleClass);

        var grid = el('er-select-candidates-grid');
        grid.innerHTML = _pendingTurn.candidates.map(function (p, i) {
            return selectCandidateCardHtml(p, i, roleClass);
        }).join('');
        grid.querySelectorAll('.er-select-cand-card[data-index]').forEach(function (card) {
            card.onclick = function () {
                var idx = parseInt(card.getAttribute('data-index'), 10);
                // ⚠️ [0.59.0] طلب صريح جديد: النقر على بطاقة مرشَّح بشاشة
                // الإقصاء صار يُقصي فوراً (نفس resolveTurnSelection
                // المستخدَمة أصلاً بشاشة الإرجاع — تماماً كأن صاحب الدور
                // كتب رقم اللاعب بالشات) — يلغي خطوة "تحديد ثم تأكيد
                // بالزر" القديمة (selectCandidateManually) بالكامل.
                resolveTurnSelection(idx);
            };
        });

        var forceBtn = el('er-force-eliminate-btn');
        forceBtn.style.display = isRevive ? 'none' : '';
        // ⚠️ [0.59.0] الزر الأحمر صار مخصَّصاً حصراً لإقصاء صاحب الدور
        // نفسه (لا وجود لحالة "مرشَّح محدَّد" بعد الآن، لأن النقر على
        // بطاقة مرشَّح صار يُقصي فوراً بدل التحديد) — نص ثابت دائماً.
        if (!isRevive) forceBtn.textContent = '❌ إقصاء صاحب الدور';

        if (AGP.playerCard) AGP.playerCard.fitAllNames(grid);

        overlay.style.display = 'flex';
    }

    // ⚠️ playerCardHtml معزولة بدالة واحدة — تستخدم AGP.playerCard
    // المشترك (js/agp-player-card.js) بدون إطار (showFrame:false) عمداً؛
    // ما زالت تُستخدَم بتبويب "إعلان النتيجة" (showResultAnnouncement) —
    // راجع أدناه. نافذتا الإقصاء/الإرجاع الجديدتان لهما بطاقة محلية خاصة
    // (selectCandidateCardHtml) بدل هذي، لتطابق تصميم روليت الروسي بالحرف.
    function playerCardHtml(p) {
        if (!AGP.playerCard) return '<span>' + escapeHtml(playerLabel(p)) + '</span>';
        return AGP.playerCard.renderHtml(p, { showFrame: false });
    }

    // ⚠️ [0.61.0] بطاقة "صاحب الدور" المكبَّرة داخل صف #er-chooser-row —
    // حلقة 88px (ringAvatarHtml نفسها المستخدَمة بشاشة الفائز/الإعلان) +
    // اسمه + رقمه الثابت (playerNumber) بجانب بعض.
    function selectChooserCardHtml(chooser, roleClass) {
        return '<div class="er-select-chooser-card">' +
            '<div class="er-select-chooser-ring ' + roleClass + '">' + ringAvatarHtml(chooser) + '</div>' +
            '<div>' +
                '<div class="er-select-chooser-nmrow">' +
                    '<span class="er-select-chooser-nm" data-agp-pcard-name="1">' + escapeHtml(playerLabel(chooser)) + '</span>' +
                    '<span class="er-select-chooser-num ' + roleClass + '">' + playerNumber(chooser) + '</span>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // ⚠️ [0.61.0] بطاقة مرشَّح بشبكة الاختيار — أفاتار 60px يتراكب على لوح
    // اسم دائري (نفس نمط لوبي-قياسي-v1)، والرقم الثابت (playerNumber)
    // عنصر عادي داخل تدفّق لوح الاسم مباشرة بعد النص (مو موضع مطلق).
    function selectCandidateCardHtml(p, index, roleClass) {
        return '<div class="er-select-cand-card" data-index="' + index + '">' +
            '<div class="er-select-cand-row">' +
                '<div class="er-select-cand-avatar">' + ringAvatarHtml(p) + '</div>' +
                '<div class="er-select-cand-plate">' +
                    '<span class="er-select-cand-name" data-agp-pcard-name="1">' + escapeHtml(playerLabel(p)) + '</span>' +
                    '<span class="er-select-cand-num ' + roleClass + '">' + playerNumber(p) + '</span>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // ⚠️ [0.59.0] selectCandidateManually() حُذفت بالكامل — النقر على بطاقة
    // مرشَّح صار يُقصي فوراً (resolveTurnSelection)، ما عاد فيه حالة
    // "تحديد بدون تأكيد" تحتاج تمييزاً بصرياً أو نص زر متغيّر.

    // ⚠️ [0.59.0] الزر الأحمر (نافذة الإقصاء فقط، مخفي بنافذة الإرجاع) —
    // يُقصي صاحب الدور نفسه حصراً الآن (لا وجود لحالة "مرشَّح محدَّد"
    // بعد إلغاء selectCandidateManually). eliminatorId صار
    // STREAMER_ELIMINATOR_ID بدل chooser.id نفسه — بطلب صريح: يظهر
    // بتبويب الإعلان كأن "الاستريمر" هو من أقصى صاحب الدور (بطاقة فعلية
    // باسم "الاستريمر")، بدل الشكل القديم بلا بطاقة مُقصي إطلاقاً (كان
    // مطابقاً لحالة إقصاء الوقت القديمة). نفس الأثر بالضبط لإقصاء انتهاء
    // الوقت — راجع applyEliminationTimeout أدناه.
    function handleForceEliminateClick() {
        if (!_pendingTurn || _pendingTurn.type !== 'eliminate') return;
        var chooser = _pendingTurn.chooser;
        if (!chooser) return;
        AGP.timerManager.stop(TIMER_NAME);
        eliminatePlayer(chooser, STREAMER_ELIMINATOR_ID);
    }

    // ⚠️ [0.61.0] "استئناف اللعبة" — الزر الوحيد بنافذة الإرجاع، وأحد
    // زرَّين بنافذة الإقصاء. يغلق الدور بدون أي إقصاء/إرجاع. بنافذة
    // الإقصاء فقط: نفس تصفير دوران العجلة القديم (راجع تعليق
    // handleSpinClick) + استئناف "العب" التلقائي لو مفعَّل — بنافذة
    // الإرجاع لا تصفير ولا استئناف تلقائي (بالضبط مطابقة لأثر كتابة
    // "تخطي" بالشات الموجود من قبل بدون تغيير).
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

    // ⚠️ #er-modal-chooser-card عنصر قديم من التصميم السابق لنافذتَي
    // الإقصاء/الإرجاع — لم يعد يُملأ بأي محتوى من renderTurnModal الجديد
    // (0.61.0)، لكن showResultAnnouncement/renderWinnerScreen ما زالا
    // يستدعيان هذي الدالة دفاعياً (احتياطاً لو بقي ظاهراً من حالة سابقة)
    // — إبقاؤها بلا ضرر، أرخص من تتبّع كل نداء لها وحذفه.
    function hideChooserCard() {
        var card = el('er-modal-chooser-card');
        if (card) { card.style.display = 'none'; card.innerHTML = ''; }
    }

    function closeTurnModal() {
        var overlay = el('er-select-overlay');
        if (overlay) overlay.style.display = 'none';
        AGP.timerManager.stop(TIMER_NAME);
        if (typeof _turnTickUnsub === 'function') _turnTickUnsub();
        if (typeof _turnEndUnsub === 'function') _turnEndUnsub();
        _turnTickUnsub = null;
        _turnEndUnsub = null;
        _pendingTurn = null;
        _warningPlayedForSecond = null;
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
        var t = el('er-select-timer');
        if (!t) return;
        t.textContent = '⏱️ ' + seconds + ' ث';
        t.classList.toggle('er-timer-warning', seconds > 0 && seconds <= 10);
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
     * ⚠️ [0.62.0] لم تعد تُستدعى إطلاقاً بـtype='revive' (استُبدل استدعاؤها
     * بـshowReviveSplash() الجديدة بطلب صريح — راجع تعليقها). فرع الإرجاع
     * بهذي الدالة (isEliminate===false) صار كوداً غير مستخدَم حالياً، أُبقي
     * بدون حذف بنفس منطق الإبقاء المعتمَد بهذا الملف (صفر أثر جانبي، قابل
     * للرجوع له لاحقاً لو احتاج الأمر). فرع الإقصاء (type='eliminate') لا
     * يزال يُستدعى فعلياً وبلا أي تغيير.
     */
    function showResultAnnouncement(type, data, onDone) {
        ensureScaffolding();
        var overlay = el('er-modal-overlay');
        var box = el('er-modal-box');
        if (!overlay || !box) { if (typeof onDone === 'function') onDone(); return; }
        hideChooserCard();

        var isEliminate = type === 'eliminate';
        playSound(isEliminate ? 'eliminate' : 'revive');

        // ⚠️ [0.52.0] تنظيف: راجع نفس التعليق بـrenderTurnModal أعلاه —
        // محدود بشاشة الفائز فقط، تبويب الإعلان يبقى بشكله المصمَت القديم.
        overlay.classList.remove('er-winner-backdrop');

        // ⚠️ [0.55.0] طلب صريح جديد (بعد مراجعة [0.54.0] الفعلية على
        // الموقع المنشور) بمواصفات دقيقة جداً (جدول قياسات + SVG مرجعي
        // 500×350): يستبدل تصميم [0.54.0] بالكامل (العنوان المختصر
        // "🎯 إقصاء ناجح" + الأيقونة بين الصورتين) بـ: (أ) جملة كاملة أعلى
        // التبويب تتضمّن اسمَي الطرفين حرفياً ("قام X بإقصاء Y بنجاح")،
        // (ب) بطاقة شخص لكل طرف (145px عرض) فيها حلقة ملوَّنة حول الصورة
        // (112px، حشوة 5px) + وسم دور (كبسولة صغيرة: "✅ أقصى"/"❌ انقصى")
        // + الاسم — بترتيب رأسي وفاصل 8px بين كل عنصر، بدون أي أيقونة
        // منفصلة بين الصورتين هذي المرة (الوسمان يكفيان لتمييز الدورين).
        // صورة الطرف "المُقصى" فقط تُعرَض بتشبّع رمادي 60% (filter:saturate)
        // + شفافية 0.9 حسب الجدول المُرسَل.
        // ⚠️ حالة الإرجاع (revive) لم تُذكَر بالطلب (كل الأرقام/الألوان
        // كانت خاصة بحالة الإقصاء تحديداً) — مدّدتها بحكمي الخاص بنفس
        // البنية (جملة + بطاقتان بنفس المقاسات)، بلون أخضر لطرفي الإرجاع
        // معاً (بدل أحمر/أخضر) بما إنه فعل إيجابي للطرفين، مع وسمَين
        // مختلفَين نصّياً ("✅ رجّع"/"💚 رجع") للتمييز بينهما بدل اللون —
        // موثَّق بالـCHANGELOG، قابل للتعديل لو تبي تفاصيل مختلفة لها.
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
                ringClass: 'er-announce-ring-green',
                badgeClass: 'er-announce-badge-green',
                badgeText: isEliminate ? '✅ أقصى' : '✅ رجّع'
            })
            : '';
        var targetCardHtml = isEliminate
            ? announcePersonCardHtml(data.target, {
                ringClass: 'er-announce-ring-red er-announce-ring-desaturate',
                badgeClass: 'er-announce-badge-red',
                badgeText: '❌ انقصى'
            })
            : announcePersonCardHtml(data.target, {
                ringClass: 'er-announce-ring-green',
                badgeClass: 'er-announce-badge-green',
                badgeText: '💚 رجع'
            });

        // ⚠️ [0.57.0] طلب صريح: إيموجي 💀 بين البطاقتين يمثّل الإقصاء —
        // لحالة الإقصاء فقط (ما له معنى بحالة الإرجاع، فما أُضيف لها).
        var vsEmojiHtml = isEliminate ? '<span class="er-announce-vs-emoji">💀</span>' : '';
        box.className = 'er-announce-box ' + (isEliminate ? 'er-announce-eliminate' : 'er-announce-revive');
        box.innerHTML =
            '<div class="er-announce-title">' + titleHtml + '</div>' +
            '<div class="er-announce-row">' + actorCardHtml + vsEmojiHtml + targetCardHtml + '</div>';

        overlay.style.display = 'flex';

        // ⚠️ [0.45.12] تقليل مدة ظهور تبويب الإعلان من 4 ثوانٍ إلى 3 —
        // طلب صريح.
        window.setTimeout(function () {
            overlay.style.display = 'none';
            box.className = '';
            if (typeof onDone === 'function') onDone();
        }, 3000);
    }

    // ⚠️ [0.55.0] لم تعد showResultAnnouncement() تستخدم هذي الدالة (استُبدلت
    // بـannouncePersonCardHtml أدناه) — أُبقيت بدون حذف لأنها غير مؤذية
    // ولضمان صفر أثر جانبي على أي كود آخر قد يعتمد عليها لاحقاً.
    function announcePersonHtml(player, effectClass) {
        return '<span class="er-announce-person">' +
            '<span class="er-announce-avatar-wrap ' + effectClass + '">' + ringAvatarHtml(player) + '</span>' +
            '<span class="er-announce-person-name">' + escapeHtml(playerLabel(player)) + '</span>' +
            '</span>';
    }

    /**
     * ⚠️ [0.55.0] بطاقة شخص جديدة لتبويب إعلان النتيجة (حلقة ملوَّنة حول
     * الصورة + وسم دور كبسولة + الاسم) — حسب مواصفات دقيقة أرسلها
     * المستخدم (جدول قياسات + SVG مرجعي). راجع showResultAnnouncement()
     * والتعليق المطوَّل هناك للسياق الكامل.
     * @param {Object} opts - {ringClass, badgeClass, badgeText}
     */
    function announcePersonCardHtml(player, opts) {
        opts = opts || {};
        return '<div class="er-announce-person-card">' +
            '<div class="er-announce-ring ' + (opts.ringClass || '') + '">' + ringAvatarHtml(player) + '</div>' +
            '<div class="er-announce-role-badge ' + (opts.badgeClass || '') + '">' + (opts.badgeText || '') + '</div>' +
            '<div class="er-announce-person-name">' + escapeHtml(playerLabel(player)) + '</div>' +
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
            // إرجاع أي أحد (نفس أثر زر "استئناف اللعبة" الجديد بالضبط —
            // [0.61.0] أضاف الزر كبديل يدوي، لم يلغِ "تخطي" بالشات).
            if (_pendingTurn.type === 'revive' && text === 'تخطي') {
                AGP.timerManager.stop(TIMER_NAME);
                closeTurnModal();
                return;
            }

            var n = parseInt(text, 10);
            if (isNaN(n)) return;
            // ⚠️ [0.61.0] إصلاح خلل حقيقي: الرقم المكتوب بالشات يُطابَق
            // برقم اللاعب الثابت (playerNumber — راجع تعليقها أعلى الملف)
            // المعروض فعلياً على بطاقته، وليس بفهرس المصفوفة المؤقتة
            // (candidates) اللي يتغيّر ترتيبها كل جولة مع تقلّص/تبدّل
            // _alive — هذا الفرق بالضبط كان يخلي الرقم "ما يُقبل" أحياناً.
            var idx = -1;
            for (var i = 0; i < _pendingTurn.candidates.length; i++) {
                if (playerNumber(_pendingTurn.candidates[i]) === n) { idx = i; break; }
            }
            if (idx === -1) return;
            resolveTurnSelection(idx);
        });
    }

    /* ======================================================================
     *  9) الإنعاش عن طريق الدعم — عبر حدث stream:giftReceived الموجود أصلاً
     * ==================================================================== */
    function wireGiftListener() {
        _giftUnsub = AGP.events.on('stream:giftReceived', function (payload) {
            var settings = liveSettings();
            if (!settings.giftRevivalEnabled) return;
            if (!payload || !payload.giftName) return;
            if (payload.giftName !== settings.giftRevivalGiftName) return;

            var entry = _eliminated.filter(function (e) {
                return e.player.id === payload.id || e.player.name === payload.name;
            })[0];
            if (!entry) return;

            // ⚠️ [0.66.0] المباراة خلصت فعلياً (حتى بعد مهلة
            // FINAL_ELIMINATION_GIFT_GRACE_MS الجديدة بـeliminatePlayer) قبل
            // ما توصل هذي الهدية — نوضّح للمضيف إنها وصلت متأخر بدل ما
            // تختفي بصمت تام بدون أي أثر.
            if (!_matchActive) {
                showToast('🎁 وصلت هدية إنعاش لـ' + playerLabel(entry.player) + ' بعد ما خلصت المباراة');
                return;
            }

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
        // ⚠️ [0.62.0] راجع showReviveSplash() أدناه — استُبدلت
        // showGiftReviveCard() (الإشعار الصغير أسفل الشاشة) بتبويب "عودة
        // لاعب" الجديد بطلب صريح.
        showReviveSplash(entry.player, { reason: 'gift' });
        // ⚠️ لا نضيفه لقائمة نافذة إقصاء مفتوحة حالياً لو موجودة — يظهر
        // فقط بداية الدورة الجاية على العجلة (موجود أصلاً بـ_alive الآن).
    }

    /**
     * ⚠️ [0.46.0→0.62.0] "عودة لاعب" — نافذة احتفالية موحَّدة لأي إنعاش
     * ناجح، بصرف النظر عن سببه (بالدعم أو عبر آلية "انعاش صديق" بنافذة
     * الاختيار). تحل محل تصميمين منفصلين سابقاً: (أ) showGiftReviveCard()
     * القديمة (إشعار صغير أسفل الشاشة لحالة الدعم فقط)، (ب) فرع الإرجاع
     * بـshowResultAnnouncement() (بطاقتَي "مين رجّع مين" لحالة انعاش
     * الصديق فقط) — طلب صريح جديد بتوحيد العرض بنافذة واحدة جميلة بدل
     * تصميمين مختلفين. فرع الإقصاء بـshowResultAnnouncement() لم يتأثر
     * إطلاقاً ولا يزال يعمل بشكله القديم (لم يُذكَر بالطلب).
     *
     * ⚠️ [0.46.0] الإنعاش بالدعم (هدية) قد يحدث بأي لحظة — حتى وسط نافذة
     * دور مفتوحة — فلا يجوز استخدام تبويب #er-modal-box نفسه (يقاطع
     * الدور الجاري). لنفس السبب بالضبط، #er-revive-splash-overlay عنصر
     * مستقل تماماً بـpointer-events:none، لا يتفاعل مع أي نقر ولا يقاطع
     * أي نافذة مفتوحة تحته — يظهر فوقها فقط بصرياً لمدة ثانيتين ثم يختفي
     * تلقائياً من تلقاء نفسه.
     * @param {Object} player - اللاعب الذي عاد للعبة
     * @param {Object} opts - {reason: 'gift'|'friend', chooser?: player}
     *   chooser (اختياري، لحالة 'friend' فقط) - اللاعب صاحب الدور الذي
     *   اختار إرجاعه، لعرض اسمه بنص السبب (نفس المعلومة اللي كانت تُعرَض
     *   سابقاً ببطاقة "مين رجّع مين").
     * @param {Function} [onDone] - ⚠️ يُستدعى بعد اختفاء التبويب تلقائياً
     *   (بعد ثانيتين بالضبط) — نفس دور onDone بـshowResultAnnouncement()،
     *   يحافظ على استمرار تدفّق اللعبة (مثلاً maybeAutoSpin() بعد إنعاش
     *   عبر "انعاش صديق"). حالة "بالدعم" لا تمرّر onDone لأنها لا تُتبَع
     *   بأي إجراء إضافي بالكود الأصلي (كانت تُظهر الإشعار وتكتفي).
     */
    function showReviveSplash(player, opts, onDone) {
        opts = opts || {};
        ensureScaffolding();
        var overlay = el('er-revive-splash-overlay');
        var box = el('er-revive-splash-box');
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

        // ⚠️ [0.63.0] ترتيب جديد بطلب صريح: قلب (صورة PNG) أعلى التبويب،
        // مباشرة تحته نص السبب، ثم صورة اللاعب، ثم اسمه تحت الصورة —
        // بدل الترتيب القديم (قلب، صورة، اسم، سبب). نفس الترتيب يطبَّق
        // على حالتَي 'gift' و'friend' معاً (نفس القالب لكلتيهما).
        box.innerHTML =
            '<img class="er-revive-splash-heart" src="revive-heart.png" alt="">' +
            '<div class="er-revive-splash-reason">' + reasonHtml + '</div>' +
            '<div class="er-revive-splash-avatar">' + ringAvatarHtml(player) + '</div>' +
            '<div class="er-revive-splash-name">' + escapeHtml(playerLabel(player)) + '</div>';

        overlay.style.display = 'flex';
        // ⚠️ إعادة تشغيل أنيميشن pop-in لو ظهرت النافذة مرتين متتاليتين
        // بسرعة (مثلاً هديتان إنعاش خلال أقل من ثانيتين) — إزالة الكلاس
        // ثم فرض إعادة تدفّق (reflow) عبر offsetWidth قبل إضافته من جديد.
        box.classList.remove('er-revive-splash-anim');
        void box.offsetWidth;
        box.classList.add('er-revive-splash-anim');

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
        assignPlayerNumber(newPlayer); // ⚠️ [0.61.0] راجع تعليق _playerNumbers
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

    // ⚠️ [0.45.7] البانر صار مخفياً افتراضياً (راجع CSS er-log-visible) —
    // زر دائري صغير ثابت بأعلى يسار الشاشة يُظهره/يُخفيه. البانر نفسه
    // position:fixed خارج تخطيط #er-stage بالكامل، فإخفاؤه/إظهاره لا
    // يزاحم ولا يحرّك أي عنصر بشاشة اللعب — الزر ثابت بمكانه بغضّ النظر
    // عن حالة البانر (z-index أعلى منه) حتى يبقى قابلاً للنقر دائماً.
    function ensureEventLog() {
        if (!el('er-event-log')) {
            var log = document.createElement('div');
            log.id = 'er-event-log';
            log.innerHTML = '<h3>📋 أحداث المباراة</h3><div id="er-event-log-list"></div>';
            document.body.appendChild(log);
        }
        if (!el('er-event-log-toggle')) {
            var btn = document.createElement('button');
            btn.id = 'er-event-log-toggle';
            btn.type = 'button';
            btn.title = 'إظهار/إخفاء أحداث المباراة';
            btn.textContent = '📋';
            btn.onclick = function () {
                var logEl = el('er-event-log');
                if (!logEl) return;
                var visible = logEl.classList.toggle('er-log-visible');
                btn.classList.toggle('er-log-toggle-active', visible);
            };
            document.body.appendChild(btn);
        }
    }

    function logEvent(type, text) {
        ensureEventLog();
        var list = el('er-event-log-list');
        if (!list) return;
        var item = document.createElement('div');
        item.className = 'er-event-log-item';
        item.innerHTML = '<span class="er-event-icon">' + (EVENT_ICONS[type] || '•') + '</span><span>' + escapeHtml(text) + '</span>';
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
    // ⚠️ [إصلاح مشترك] أسماء الكلاسات هنا صارت agp-trophy-points/
    // agp-points-* (بدل er-trophy-points/er-points-* القديمة) لتطابق
    // التنسيق المشترك الجديد المُعرَّف بـjs/agp-player-card.js (راجع
    // AGP.playerCard.renderTrophyCard) — هذا HTML يُمرَّر لها عبر
    // opts.pointsHtml، فلازم يستخدم نفس أسماء كلاساتها بالضبط.
    function pointsHtmlFor(pointsResult, player) {
        if (!pointsResult) {
            return '<div class="agp-trophy-points agp-points-noaccount">تعذّر جلب النقاط الآن</div>';
        }
        var awarded = findAwardedFor(pointsResult, player);
        if (awarded) {
            return '<div class="agp-trophy-points agp-points-earned">+' + awarded.added + ' نقطة' +
                '<span class="agp-points-sub">تظهر في بروفايلك</span></div>';
        }
        return '<div class="agp-trophy-points agp-points-noaccount">لازم يسوي حساب عشان تظهر نقاطك بالبروفايل</div>';
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
            ? '<img class="er-ring-avatar" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;er-ring-avatar er-ring-avatar--fallback&quot;>' + escapeHtml(initials) + '</div>\';">'
            : '<div class="er-ring-avatar er-ring-avatar--fallback">' + escapeHtml(initials) + '</div>';
    }

    // ⚠️ [إصلاح مشترك] ringHtml()/trophyCardHtml() المحليتان القديمتان
    // (بطاقة "300×400 زجاجية + حلقة ملوَّنة") حُذفتا من هنا بالكامل —
    // انتقل نفس التصميم لدالة مشتركة AGP.playerCard.renderTrophyCard()
    // بـjs/agp-player-card.js، تستدعيها renderWinnerScreen() أدناه
    // مباشرة. ringAvatarHtml() أعلاه أُبقيت كما هي (لا تزال مستخدَمة
    // بمكان آخر — إعلان الإقصاء/الإرجاع وبطاقة الإنعاش العائمة).

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
    // ⚠️ [0.52.0] أيقونة تاج الفائز — صورة PNG ثابتة زوَّدنا بها المستخدم
    // (أيقونة تاج مسطّحة ذهبية بقاعدة برتقالية وجوهرة بنفسجية)، مُضمَّنة
    // هنا كـ data URI (base64) داخل هذا الملف نفسه — بدون أي رابط خارجي
    // ولا ملف صورة منفصل (يبقى الملف قائماً بذاته). أُعيد تحجيمها محلياً
    // (512×512 الأصلية → 160×160 + ضغط ألوان) لتصغير حجمها قبل التضمين
    // فقط — الشكل البصري نفسه بلا أي تعديل تصميمي.
    var CROWN_ICON_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAMAAAC8EZcfAAAAwFBMVEX80xb84zX81h7431z7lAD72FL+5zT94Vj95Fn8jwCZZ578kgDUr3azh4n9mgH/qFb5XAC4uAp1Paj/f3/HoIR/fwD///+/fwD//6oAAAD95Fn91AL9mQD93i/6xwD7iAH+5DP//wD+pwn/qQD/fwCBS6GQWrP+mAD+vgD/4QL/AAD//1T//n79mAH91AL7iQH/82D+1wN6Q6X/vz/6yAD+tgH6yAD7yQL91QL90gP7igD+1AT95FH91AP93jD+5WB9Tnm4AAAAQHRSTlNhE6HtKBjXWqih/2r//8sDAwP/Av8CAQQDAP7+/v79/v4B/gMC//9IBP4BAwKvz8P+D/8E0f8rDrFRVi0QjtL+LQhbUQAAC01JREFUeNrtnIl22joQhmUgSbM16XIXYexY2JcYk9DSkBCapHn/t7qSVy0zsth6OfegnqatS6yPf2Z+jQSB0D0f5AB4AIRGnB0U3Agw6aVZtr+AMb0dnvKvewuY0I/DQY+xfQWMaW8wGJ5zzj0FTOn9cDD42IvZfgIm9JzzDXgWJmwPAa/zAOeDBzneN0AR1fPBoCakbAXHzpLkNyjYOx3c3JSAw4+3+6Vglpx/u8lHRTj4eB6zzPm59dapfLJKdQxuqlGF+dHVbhJ6+/gx2TFg7/RmoAByCXvOgMLds3jHOcgRG8Lh4L63mrvf090CitUtr5KccMjVo8xNP5YLOBiskYWrKciT6I+SUMhn5hSbTAD7Zr3C3d0zYv2VJE5oQfgtBuLF6i+qfPS2TFrwWW13qbvOermCkBZ39KjT8fgfsjld53lRe6d7XqzbLOR2MziF+Y750Ahp7zwv/orRvbLWBGRMSNjLEogvCoJIJsyyxptqe7+/XUHDtTrq0+E3U0BW8AnCo5owtxfD3e/pTgGTrHdvZmBc8QVB90NDyK6r9bEiHA5OexnbJSA47mq+qN///uFVzsOfkr0P+fK9+10dixMbn0r4F+8mzitA4TN0pV6cbF+/grCJMr2+pr0S8JSu2ohvBZDpfBohT9ifOeA3Gu96JXHk0wmvi/Wnx//y+wFBviIPWXOY08sDvOt2CzZuD+LLCZt840u4cPf/BJB2jiE+QUivGvP8Ofi2s46aeezLxLvDAH9FMGC/K9s5+9mrQ85SxvjvLQGyKi4TBq98JCoIDcATeoc1vvm4YtsA5DfxSKf74eTIbPVKE0QINb7KYfhNXsjz9Jm8IDdcDZBRrxNFUf/79z43DvCGDzDhCf8P+IZv/tj3+e+3h3ZC0lqjr8fH5czfu69fwBt6EOEJvwy1Gmw2FXh8BMcdr/UUrw3wLq/RegGDkwoiRPgo+/O55OPfcNxp6nw9wCvqRXKBniA3NAiR+uAhXTZ8QRR5bUFuAZzQTiTpwiWcUBdCjI/jlAIWrWPUgRPVFTCjV79kwH53gj1jQRhUhFh8RYX4jYAc8NdmCvL7BUqI+6/YDRn7O6gMu0vvGLbjmpUFUgG2xbgN8LW4UzvgFfOaGB8xNMIVYBniXw8bAdbrWLN4MXu25o/FU5V/+1RRsLNhkXAPPpaK8zuaXEmZDOUjj7B5U/o2lnOQbFYkopeS5+3fMZca6XdPsHnrGEdlCrYdgLYZ9aS2jyifFw3dn0pPg6dCSsm4SkJhg7GbUTPGHAg54BH2KE8SMI8xUiaLKsYcjwf4Cj2wYw1g0ZkxROyJ6BaqqbEclEvE6uiMksoIo46HPagAyr+SouWZzVie6fDk9Dhqsn/SXiJ4maR06VdG+Isi8RUYs8Wi6MwI/URT3p350+dlAicOY0dBs5yAhA9KiZT1/gDp91Lx5QWCiNwjnTAM52QmBGf0aV60Z+PpE0jIlIah+wpkF7sy2v4ucIIVN3wR/+Uh03GgUAx/zjcJhD7xvxVj7L9AtVLKUwF2j9iXthKBy4Rli6m00PESmYB8YcEnuF4omXFcvyKcwoBaR3Onb070EoHLhHuq1ArmgEDFJbNSvzAHSgnxawX5hSVQKEwFFFN7+ooNtfzass1SqvCJZS6GbNKv8MQgZB7KgM9mWlQdjSSOZjZmiUBlwioDLPngToar4Ut8/pTIuPzfsXlIrzXVxUomE7IHcGfcVfKFlStI3ciAVcLoIlSJdMCZ8T1qjQA7jkkGCag5kmSA9QCqpAL0NcBGUQYAqiloTH4FlIheJqlkgA2g2e8zmuqAc5kQzEEGAXLCchn9Qj3sZKEuk5g++UonjTaDcZGDTUgJ8WXCZZy21kht2MxSIkqZ8B5ravKBVZLGRAFcktp2csolnRkbYy+Cj66Oio0H8/DDo+IRCVtM1QJGq4TFVAYcTxdEMm5xfUk1rwZrpEyxB1a0Y7CAIg+yiciRyTPEl1fJJ/0cSC6KsVhJ8qXPbwjftBMduEaa478YKZGmTFLdANEqSemsIy0j4+cnmhBROKQzrwHFVfnkrtw29SFCbjbIKtKUyd3CMEAZMFFO5Z6aZW7K26vcPYv2iy2e5hW4v5RErDae4PT9E3uExVOY4Xz8xql0jF2Hl2NMn6oGtemoSbPEvC1oihzOGISvaInkZeIBBt0ASkczKV106i5mTDhb8YYSUjfZ0pqSd4bMXiNVGdgEFP//AhiguZbw6pXCy9uspNqAkGY7qFh4FWa8RsrusGMFfP8wtfCJJPSM8IrRrLikSdG5ssa8pXmYLTVSDLuA/b6Nr1pLlPAWC1pi7ItTrc8ZT1/yzaitRsQI7IDvAWgwslWzT2p4+dxvdQ3IgMRXl2mfiAMDa43UAuIP6Fv4qipRw5snGDMAE7E5UQHHPMyxvUbaBCwAMT5RJXET3mbmGRDijKZzDTAPs7VGHATsB36AD56EZG7wyVsjgjY6ZZiPrYDtAtaPQQCN8GpNH6GWJKwLcCNAC2EUmHi+sOkUVJCEEKAg3CDCNkCYT+yGIQUTYztQj80E7GMeE/kwnz8DAQ2rbid0ExCREJPP95/lHofgW1KF8N1RwMtLRwlxPtmmFUCsSopEdAO8+Pz5wkVCPLyqTWsKPoUoICSiGeGLH//88+OiHRCXT68RGTDTGhp9dN/bBOyeCcCzbluM7XzTlGbwIXoCWjUaZlPAS87HCS/tElrDm9t0jJzyW5PQDLMh4EXOx8eFDdAun2bTKiBq1ZKI7zhgt8QbjYAgN3y+nU+kIKagxaqBMBsRPvtRAY7OMMAoaOXz1fMrGTDL6LwNsAmzLuBlwzcafYXLpC28eY2o+3Kibpw7fjthEWZdwAuZbzTqQhK2h1e3aQOQOAAWYdYE7J6pgEYaRpJ8tgnGSwtgi1UrYdYANb7R6NIMsgOebtMG4MINsN6lVa9NXOh8o5HuNb4b33RhAaz6hXZAX91tNg7TDD3ITni6TeuAblUivWBeTv71swmoV3LXKTiaTZuAxA0wspcIWCZuybO0Kpg4JmGgnycAOdg1tvAuqePrLzMQ/ZXauRMg0idIhF+xU5CWGtEPhQl4yB6uFmHAZ87AHXLr0G3aAHRLwgDYi2iF3IWOwhwAly2AsZNVg5s5JQ0vLCddq9i0mYMuVRLAR25SkC9tJ13WFJy1AFZddbiygDyCox94P+gmoWHTJqCLVWNnlpaO2rFMDJs2AT+1V0mAnprjexJXCZfGa2NmiFurBD/vQHd1zoCzVkBeJy1WHVhOpbF9sWuZTM2XPwnyemi4hoAiyJ8/X1qPaVa0aQCw1artx/qXly3nSCvWCKSgPQkDxxOttSR8cQhxm1W7HQmuCeg5APKHzC0xDqLNAG1lAr0hAQC0W/WmAtokhGoEALRbdbQpoE3CpZOC1r1nEG1WInYJZ8AbsyDABW7VGwtoA5wytzfZWs6qtyEgGmOegp+cAC1WHWxBQFRCyKZBQMsx4TYijEv4Ar0jEwwxZtWbriItEs4cAekfRUMT7kZAFPAZfBcyAd9L3EFfVtyGgHDHANo0Boi87rklAREJl9TRZlCr3h4gKOGTc4gz2KqjcmzO994HbTpz/mmI8pM5mjHc/Xg8hd+pjwA2P9mvfADBLsf9ngMOD4AHwAPgAXCPAQePj9rdHocbX3hUL2wCOOArZajcjF94tF545BeG1guhdmETQDG9cjMxm6/PFlov+NpTGBoXNgXU5QhXAwx1jbcJePOo3VxMpyZQ6IctFzRg8STDHVbxcOsXDj54ADwAHgAPgP8nwDj/DMRm3JjLwPYBz+GfeCfIp6T8VMftzkePZmt9EMTvG9lqn1QRJ8qIdz6SNT9K4z8fB8D/PeC/QZ+CRt3wTxkAAAAASUVORK5CYII=';

    var CONFETTI_COLORS = ['#ffd400', '#ff4dff', '#00c2ff', '#7c3aed', '#4ade80', '#ff6b8a'];
    function spawnConfetti(container, count) {
        if (!container) return;
        count = count || 26;
        for (var i = 0; i < count; i++) {
            var piece = document.createElement('span');
            piece.className = 'er-confetti-piece';
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
        var overlay = el('er-modal-overlay');
        var box = el('er-modal-box');
        if (!overlay || !box) return;

        var mostElim = computeMostEliminations();

        // ⚠️ [تثبيت الشكل النهائي — طلب صريح 2026] بطاقتا الفائز/الأكثر
        // إقصاءً تُبنَيان عبر AGP.playerCard.renderTrophyCard() المشتركة
        // (js/agp-player-card.js) — بدون label/gameName/extra بعد الآن،
        // البطاقة صارت: تاج (فائز فقط) ← صورة ← اسم ← فراغ ← نقاط فقط.
        // نفس المعلومة (اسم اللعبة + مين فاز) انتقلت لسطر واحد فوق صف
        // البطاقتين (h2 أدناه) بدل تكرارها داخل كل بطاقة.
        var cardsHtml = '';
        if (winner) {
            cardsHtml += AGP.playerCard.renderTrophyCard(winner, {
                cls: 'er-trophy-winner', kind: 'winner', cardId: 'er-trophy-card-winner',
                showCrown: true, crownIconDataUri: CROWN_ICON_DATA_URI,
                pointsHtml: pointsHtmlFor(pointsResult, winner)
            });
        }
        if (mostElim) {
            cardsHtml += AGP.playerCard.renderTrophyCard(mostElim.player, {
                cls: 'er-trophy-most', kind: 'most', cardId: 'er-trophy-card-most',
                pointsHtml: pointsHtmlFor(pointsResult, mostElim.player)
            });
        }

        // ⚠️ [0.52.0] طلب صريح: شاشة الفائز تحديداً بدون "لوح/تبويب" خلف
        // البطاقتين — بدل الصندوق المشترك المصمَت (er-modal-box، تدرّج
        // بنفسجي + حدّ + ظل)، الخلفية (شاشة اللعب خلفها) تصبح مغبّشة
        // (backdrop-filter) والبطاقتان تطفوان مباشرة فوقها. كلاسا
        // er-winner-panel/er-winner-backdrop محدودان بهذه الشاشة فقط
        // (تُزال من renderTurnModal/showResultAnnouncement/openGiftPickerModal
        // فور فتح أي منها) — بقية "تبويبات" اللعبة (الإقصاء/الإرجاع/
        // الإعلان/اختيار الهدية) تبقى بشكلها المصمَت القديم بدون أي تغيير.
        box.className = 'er-winner-panel';
        box.style.textAlign = 'center';
        overlay.classList.add('er-winner-backdrop');
        box.innerHTML =
            '<div id="er-winner-box">' +
            '<h2>🏁 انتهت المباراة .. الشخص الرهيب الي فاز بلعبة "' + escapeHtml(GAME_NAME) + '"</h2>' +
            '<div class="er-trophy-cards">' + (cardsHtml || '<p style="color:#fff;font-weight:800;">بدون فائز</p>') + '</div>' +
            '<div class="er-winner-actions">' +
            '<button class="er-btn-secondary" id="er-home-btn">⬅️ رجوع لمنصة الألعاب</button>' +
            '<button class="er-btn-secondary" id="er-new-match-btn">🆕 بدء مباراة جديدة</button>' +
            '<button class="er-btn-secondary" id="er-replay-same-btn">🔄 إعادة المباراة بنفس اللاعبين</button>' +
            '</div></div>';

        document.getElementById('er-replay-same-btn').onclick = handleReplaySamePlayers;
        document.getElementById('er-new-match-btn').onclick = function () {
            AGP.gameManager.resetSession(); // يبث game:reset — يستدعي onDestroy() تلقائياً
            window.location.reload();
        };
        // ⚠️ زر "رجوع لمنصة الألعاب" — يقفل اللعبة بالكامل، نفس سلوك
        // زر 🏠 بالهيدر الثابت بالضبط (agp-game-shell.js:
        // injectPersistentHeader → agp-header-home-btn)، بدل تكرار منطق
        // التنقّل (homeUrl) هنا محلياً.
        document.getElementById('er-home-btn').onclick = function () {
            var headerHomeBtn = document.getElementById('agp-header-home-btn');
            if (headerHomeBtn) headerHomeBtn.click();
        };

        overlay.style.display = 'flex';

        window.setTimeout(function () {
            if (winner) spawnConfetti(el('er-trophy-card-winner'), 28);
            if (mostElim) spawnConfetti(el('er-trophy-card-most'), 20);
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

        var overlay = el('er-modal-overlay');
        if (overlay) overlay.style.display = 'none';
        var selectOverlay = el('er-select-overlay');
        if (selectOverlay) selectOverlay.style.display = 'none';

        stopAutoPlay();
        resetMatchState();
        _alive = roster;
        _alive.forEach(function (p) { assignPlayerNumber(p); }); // ⚠️ [0.61.0] مباراة جديدة كلياً — أرقام جديدة بترتيب هذي القائمة
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
        var overlay = el('er-modal-overlay');
        var box = el('er-modal-box');
        if (!overlay || !box) return;

        // ⚠️ [0.45.0] أيقونة كل هدية = صورة Twemoji حقيقية (رخصة MIT + CC-BY 4.0،
        // مو صور تيك توك الرسمية) + اسم الهدية + قيمتها الحقيقية بالعملات
        // (بحسب بحث فعلي — راجع الملاحظة أعلى COMMON_GIFTS وCHANGELOG).
        var itemsHtml = COMMON_GIFTS.map(function (g) {
            var active = g.value === currentValue ? 'agp-pill-active' : '';
            return '<button type="button" class="agp-pill-btn er-gift-btn ' + active + '" data-gift-value="' + escapeHtml(g.value) + '">' +
                '<img class="er-gift-icon" src="' + giftIconUrl(g) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';">' +
                '<span class="er-gift-name">' + escapeHtml(g.label) + '</span>' +
                '<span class="er-gift-coins">' + giftCoinsText(g) + '</span>' +
                '</button>';
        }).join('');

        // ⚠️ [0.52.0] تنظيف: راجع نفس التعليق بـrenderTurnModal أعلاه —
        // محدود بشاشة الفائز فقط، منبثقة اختيار الهدية تبقى بشكلها المصمَت القديم.
        overlay.classList.remove('er-winner-backdrop');

        box.className = '';
        box.style.textAlign = 'center';
        box.innerHTML =
            '<h2>🎁 اختر هدية الإنعاش</h2>' +
            '<div id="er-modal-sub">اضغط على الهدية المطلوبة — تُغلق النافذة تلقائياً بعد الاختيار</div>' +
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
                // ⚠️ [0.49.0] نص التسمية عُدِّل ليطابق التصميم الجديد المرفق
                // حرفياً ("كم الحد الاقصى لعدد الاعبين") — بطلب صريح "هذا
                // ترتيب الاعدادات نفذ". النوع/المفتاح/السلوك بلا تغيير.
                key: 'maxPlayers', type: 'counter', label: '👥 كم الحد الأقصى لعدد اللاعبين',
                min: 2, default: 20
            },
            {
                // ⚠️ [0.50.0] ترتيب الخيارين عُدِّل ليطابق مسودة Frame 2
                // حرفياً ("الجميع | المتابعين فقط") — القيم الافتراضية بلا
                // أي تغيير.
                key: 'followersOnly', type: 'pill-choice', label: '🔑 السماح بالدخول',
                options: [
                    { label: '👥 الجميع', value: false },
                    { label: '❤️ المتابعين فقط', value: true }
                ],
                default: false
            },
            {
                // ⚠️ [0.49.0] صار pill-choice بدل toggle (بطلب التصميم
                // الجديد: خياران واضحان بدل مفتاح تشغيل/إيقاف)، بنفس
                // المفتاح/الافتراضي (false = لا شيء) — صفر تغيير على منطق
                // اللعبة نفسه (friendRevivalEnabled لا يزال Boolean).
                key: 'friendRevivalEnabled', type: 'pill-choice', label: '🎗️ عند تكرار اسم لاعب لمرتين متتاليتين',
                options: [
                    { label: 'ينعش صديق مُقصى', value: true },
                    { label: 'لا شيء', value: false }
                ],
                default: false
            },
            {
                key: 'giftRevivalEnabled', type: 'toggle', label: '🎁 الإنعاش عن طريق الدعم',
                default: false
            },
            {
                key: 'giftRevivalGiftName', type: 'modal-trigger', label: 'اختار نوع الدعم',
                default: COMMON_GIFTS[0].value,
                formatValue: giftLabelFor,
                onOpen: openGiftPickerModal,
                showWhen: { key: 'giftRevivalEnabled', equals: true }
            },
            {
                key: 'giftRevivalMaxCount', type: 'counter', label: 'كم مرة مسموح له بالعودة',
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
                // ⚠️ [0.61.0] كان زر عائم مستقل فوق شاشة اللعب (🔃 تبديل شكل
                // الاختيار) — صار حقل إعدادات حقيقي بطلب صريح، يظهر بشاشة
                // الإعدادات الأولى ودرج وسط المباراة معاً. التطبيق الفوري
                // على شاشة اللعب نفسها (لا ينتظر دوران جديد) عبر
                // enhanceWheelModeField/setWheelDisplayMode أعلاه، لأن
                // الملف المشترك ما عنده onChange hook لحقول الإعدادات.
                key: 'wheelDisplayMode', type: 'pill-choice', label: '🎡 شكل عجلة الحظ',
                options: [
                    { label: '🎡 عجلة', value: 'wheel' },
                    { label: '📜 سكرول', value: 'reel' }
                ],
                default: 'wheel'
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
        _alive.forEach(function (p) { assignPlayerNumber(p); }); // ⚠️ [0.61.0] رقم ثابت بترتيب دخول اللوبي
        _startedAt = Date.now();
        _matchActive = true;

        wireCommentListener();
        wireGiftListener();
        renderStage();
    }

    /* ======================================================================
     *  تحسينات شاشتي الإعدادات/اللوبي المشتركتين (js/agp-game-shell.js) —
     *  خاصة بروليت الإقصاء فقط، بدون أي تعديل على الملف المشترك نفسه.
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
     *  الملف المشترك (هذا الكود موجود فقط بملف روليت الإقصاء نفسه، ولا
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
        btn.className = 'er-back-to-platform-btn';
        btn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';
        btn.addEventListener('click', homeNavigate);
        return btn;
    }

    /**
     * ⚠️ [0.52.0] يبني ترتيب شاشة الإعدادات الأولى بنموذج "بدون صندوق"
     * (settings-no-box) — نفس النموذج المطبَّق حرفياً بروليت الروسي:
     * الحقول تصبح أبناء مباشرين لـ#agp-shell-box (بلا wrapper وسيط)،
     * فتتوزّع تلقائياً على عمودين عبر CSS Multi-column (راجع
     * injectStageStyles)، بدل الهيكل السابق [0.51.0] (صندوق ثابت
     * الحجم + .er-settings-scroll + .er-settings-block + شريط سفلي
     * منفصل .er-settings-footer). الاستثناء الوحيد المتبقي كغلاف
     * فعلي: `.er-conditional-section` (خط تمييز وردي يلفّ صفّي "كم
     * مرة مسموح له بالعودة" و"اختار نوع الدعم" الشرطيّين فقط) — حقل
     * لا مقابل له بروليت الروسي فبقي كما هو وظيفياً.
     * نفس تقنية [0.46.1]/[0.49.0]/[0.50.0] الأساسية (نقل عناصر DOM
     * موجودة فعلياً عبر appendChild — يحافظ على كل مستمعات الأحداث
     * المرتبطة بها — دون أي تعديل على js/agp-game-shell.js نفسه).
     * زر اختيار الهدية (modal-trigger) يبقى ملفوفاً بغلاف محلي
     * `.er-gift-box-wrap` كالسابق — الآلية البرمجية (نافذة منبثقة بكل
     * الهدايا الحقيقية العشرين) بلا تغيير.
     * الدالة idempotent (تتحقق إن كان زر الاتصال أصلاً ابن مباشر
     * للصندوق) — تُعاد فعلياً بالكامل مع كل renderSettingsScreen جديد
     * (الملف المشترك يعيد توليد عناصر الحقول من جديد في كل مرة، فزر
     * الاتصال الجديد يكون بأب مختلف مبدئياً)، فتُطابِق الحالة الحالية
     * للحقول الشرطية تلقائياً في كل مرة.
     */
    function layoutInitialSettingsFields(box) {
        var connectBtn = el('agp-connect-btn');
        if (!connectBtn) return;
        if (connectBtn.parentNode === box) return;

        function rowFor(dataKeySelector) {
            var ctl = box.querySelector(dataKeySelector);
            return ctl ? ctl.closest('.agp-shell-row') : null;
        }

        var usernameInput = el('agp-tiktok-username');
        var usernameField = usernameInput ? usernameInput.closest('.agp-shell-field') : null;
        var keywordInput = el('agp-keyword');
        var keywordField = keywordInput ? keywordInput.closest('.agp-shell-field') : null;

        var maxPlayersRow = rowFor('[data-key="maxPlayers"]');
        var followersRow = rowFor('[data-key="followersOnly"]');
        var friendRevivalRow = rowFor('[data-key="friendRevivalEnabled"]');
        var giftEnabledRow = rowFor('[data-key="giftRevivalEnabled"]');
        var giftMaxCountRow = rowFor('[data-key="giftRevivalMaxCount"]');
        var giftNameTrigger = box.querySelector('[data-trigger-key="giftRevivalGiftName"]');
        var giftNameRow = giftNameTrigger ? giftNameTrigger.closest('.agp-shell-row') : null;
        var timerRow = rowFor('[data-key="eliminationTimerSeconds"]');
        var timeoutRow = rowFor('[data-key="eliminationTimeoutBehavior"]');

        // .gift-box — غلاف بصري محلي حول زر اختيار الهدية نفسه (لا يغيّر
        // الزر أو مستمع الحدث عليه، فقط يضيف حاوية أب حوله).
        if (giftNameTrigger) {
            giftNameRow.classList.add('er-gift-name-row');
            var giftBoxWrap = document.createElement('div');
            giftBoxWrap.className = 'er-gift-box-wrap';
            giftNameTrigger.parentNode.insertBefore(giftBoxWrap, giftNameTrigger);
            giftBoxWrap.appendChild(giftNameTrigger);
        }

        // الحقول أبناء مباشرون للصندوق مباشرة — بلا أي wrapper وسيط
        // (نفس بنية DOM المستخدَمة بروليت الروسي بالحرف).
        [usernameField, keywordField, maxPlayersRow, followersRow, friendRevivalRow, giftEnabledRow]
            .filter(Boolean).forEach(function (fieldEl) { box.appendChild(fieldEl); });

        // .conditional-section — يلفّ فقط الصفّين الشرطيّين (عدّاد
        // المرات + صندوق اختيار الهدية)، لا صف التفعيل نفسه.
        if (giftMaxCountRow || giftNameRow) {
            var conditionalSection = document.createElement('div');
            conditionalSection.className = 'er-conditional-section';
            [giftMaxCountRow, giftNameRow].filter(Boolean).forEach(function (fieldEl) { conditionalSection.appendChild(fieldEl); });
            box.appendChild(conditionalSection);
        }

        [timerRow, timeoutRow].filter(Boolean).forEach(function (fieldEl) { box.appendChild(fieldEl); });

        box.appendChild(connectBtn);
    }

    /**
     * ⚠️ [0.49.0] زر اختيار الهدية (modal-trigger) بالملف المشترك يعرض
     * نصاً محميّاً بـescapeHtml فقط عمداً (راجع renderField بـ
     * js/agp-game-shell.js) — لا يمكن حقن <img> عبر formatValue. لعرض
     * أيقونة الهدية الفعلية داخل الصندوق (طلب التصميم الجديد: "بعد
     * الاختيار تظهر داخل المربع الصغير") نعيد بناء محتوى الزر محلياً هنا
     * بعد كل رسم، بالقيمة الحالية الفعلية (AGP.gameShell.getSettings()).
     * idempotent: تتحقق أولاً أن الأيقونة المعروضة مطابقة للقيمة الحالية
     * قبل إعادة الكتابة، لتفادي أي وميض غير ضروري مع كل mutation.
     */
    function enhanceGiftNameBox(box) {
        var btn = box.querySelector('.er-gift-name-row .agp-modal-trigger-btn');
        if (!btn || !AGP.gameShell || typeof AGP.gameShell.getSettings !== 'function') return;
        var currentValue = AGP.gameShell.getSettings().giftRevivalGiftName;
        var match = COMMON_GIFTS.filter(function (g) { return g.value === currentValue; })[0];
        if (!match) return;
        var existingIcon = btn.querySelector('.er-gift-name-icon');
        if (existingIcon && existingIcon.getAttribute('data-gift-value') === match.value) return;
        btn.innerHTML =
            '<img class="er-gift-name-icon" data-gift-value="' + escapeHtml(match.value) + '" ' +
            'src="' + giftIconUrl(match) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';">' +
            '<span class="er-gift-name-text">' + escapeHtml(giftLabelFor(match.value)) + '</span>';
    }

    // ⚠️ زر "رجوع للمنصة" بشاشة الإعدادات الأولى (قبل الاتصال بالبث) —
    // طلب صريح (صورة 1)، بالإضافة لأيقونة 🏠 الثابتة بالهيدر أصلاً.
    //
    // ⚠️ [0.46.1] التفريق بين شاشة الإعدادات الأولى وشاشة الإعدادات
    // المعاد فتحها أثناء المباراة (زر الترس ⚙️، درج قسم ٦ بالمعيار):
    // كلاهما يستخدم نفس #agp-shell-box بدون أي كلاس مميِّز من الملف
    // المشترك نفسه، فنميّز بينهم بوجود #agp-tiktok-username (موجود فقط
    // بالشاشة الأولى — renderSettingsScreen لا يبنيه إطلاقاً لو
    // isReopened=true). التجميع الجديد (بطاقات مدوّرة، شريط سفلي ثابت)
    // يُطبَّق فقط على الشاشة الأولى — الإعدادات المعاد فتحها أثناء
    // المباراة تبقى بشكلها الحالي تماماً، خارج نطاق هذا التعديل.
    function enhanceSettingsScreen() {
        var box = el('agp-shell-box');
        if (!box) return;
        if (box.classList.contains('agp-lobby-box') || box.classList.contains('agp-connecting-box') ||
            document.getElementById('agp-mini-lobby-list')) return;
        var isInitial = !!el('agp-tiktok-username');
        box.classList.toggle('er-settings-initial-box', isInitial);
        if (isInitial) {
            layoutInitialSettingsFields(box);
            enhanceGiftNameBox(box);
        }
        if (box.querySelector('.er-back-to-platform-btn')) return;
        var connectBtn = box.querySelector('.agp-shell-btn-connect');
        if (!connectBtn) return;
        var backBtn = makeBackToPlatformBtn();
        // ⚠️ [0.50.0] طلب صريح بمسودة Frame 2: نص الرابط بشاشة الإعدادات
        // الأولى تحديداً صار "العودة للمنصة ←" (بدل "🏠 رجوع لمنصة ألعاب
        // أيمن"). التعديل هنا فقط — على نص هذا العنصر بالذات بعد إنشائه
        // محلياً — وليس على makeBackToPlatformBtn()/homeNavigate() نفسها
        // (تبقيان مشتركتين وبلا تغيير مع شاشة اللوبي)، فلا يتأثر نص أو
        // شكل الزر المطابق بشاشة اللوبي إطلاقاً.
        if (isInitial) backBtn.textContent = 'العودة للمنصة ←';
        connectBtn.insertAdjacentElement('afterend', backBtn);
    }

    // ⚠️ [0.48.x] enhanceLobbyList() (زر ✕ محلي index-based)، applyLobbyNameMarquee()
    // (Marquee محلي)، وnormalizeFramedCardWidths() (توحيد عرض البطاقات
    // المؤطَّرة عبر zoom محسوب) — الثلاثة حُذفت بالكامل من هنا. السبب:
    // js/agp-game-shell.js وjs/agp-player-card.js المشتركان صار فيهما
    // نفس هذي الميزات الثلاث أصلياً (renderLobbyPlayerList يمرّر
    // removable:true فتضيف زر حذف حقيقي مرتبط بمعرّف اللاعب الفعلي
    // data-remove-player-id عبر wireRemovePlayerButtons، وAGP.playerCard.
    // fitAllNames تُستدعى تلقائياً بعد كل رسم قائمة فتطبّق الـMarquee
    // بنفسها، وrenderFramedHtml تحسب عرض البطاقة المؤطَّرة رياضياً من
    // قياسات الإطار مباشرة بدل قياس DOM حي) — فأي نسخة محلية مكرِّرة
    // لنفس الشيء تتعارض بصرياً معها. حُذفت الثلاثة بالكامل بطلب صريح،
    // بدون أي استثناء ولا حل مؤقّت محلي.

    // ⚠️ [0.45.14] عنوان اللوبي بلونين — يستبدل نص "اللوبي بانتظار
    // اللاعبين" (المُعرَّف بالملف المشترك) بنص جديد بلونين، حسب تصميم
    // Figma مُزوَّد من المستخدم. تعديل DOM من كودنا فقط (استبدال
    // innerHTML لعنصر h2 موجود أصلاً) — صفر لمس لملف
    // js/agp-game-shell.js نفسه، بنفس فلسفة كل تحسينات هذا القسم.
    function enhanceLobbyHeading() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        var h2 = box.querySelector('h2');
        if (!h2 || h2.getAttribute('data-er-heading') === '1') return;
        h2.innerHTML = '<span class="er-lobby-title-plain">لوبي دخول لعبة - </span>' +
            '<span class="er-lobby-title-accent">روليت الإقصاء</span>';
        h2.setAttribute('data-er-heading', '1');
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

        if (!box.querySelector('#er-lobby-watermark')) {
            var img = document.createElement('img');
            img.id = 'er-lobby-watermark';
            img.src = '../../logo.png';
            img.alt = '';
            box.insertBefore(img, box.firstChild);
        }

        var startBtn = el('agp-start-round-btn');
        if (!startBtn) return;

        if (startBtn.textContent.indexOf('اغلاق اللوبي') === -1) {
            startBtn.textContent = '🔒 اغلاق اللوبي وبدء المباراة';
        }

        var row = box.querySelector('.er-lobby-actions-row');
        if (!row) {
            row = document.createElement('div');
            row.className = 'er-lobby-actions-row';
            startBtn.parentNode.insertBefore(row, startBtn);

            var backSettingsBtn = document.createElement('button');
            backSettingsBtn.type = 'button';
            backSettingsBtn.className = 'er-lobby-back-settings-btn';
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
        if (!row.querySelector('.er-back-to-platform-btn')) {
            row.appendChild(makeBackToPlatformBtn());
        }
    }

    // ⚠️ [0.60.0] درج إعدادات وسط المباراة — تبويب اللاعبين استُبدل
    // بالكامل بنفس نموذج روليت القبائل الفعلي (renderReopenedPlayersTab):
    // بحث + فلتر (الكل/نشطون/مقصون) + قائمة موحَّدة تجمع _alive و
    // _eliminated معاً (كل من شارك بالمباراة، بعكس قائمة اللوبي)، كل صف
    // نشط بزر × أحمر (إقصاء يدوي هادئ) وكل صف مقصى بزر ↩ أخضر (إرجاع
    // يدوي فوري، بدون فحص _friendRevivedIds). يلغي التصميم القديم
    // [0.55.0] (تضمين عنصر إدارة اللاعبين الجاهز من الملف المشترك كما
    // هو) بالكامل على هذا الجزء فقط — باقي الدرج (الرأس/التبويبات/حقول
    // الإعدادات) بلا تغيير.
    var _erDrawerTab = 'settings';
    var _erPlayersTabFilter = 'all';

    function enhanceReopenedDrawer() {
        var box = el('agp-shell-box');
        if (!box || !document.getElementById('agp-settings-player-list')) return;
        box.classList.remove('er-mini-lobby-active');
        box.classList.add('er-inmatch-drawer');
        box.classList.toggle('er-tab-players', _erDrawerTab === 'players');

        if (box.firstElementChild && box.firstElementChild.classList.contains('er-drawer-header')) {
            box.querySelectorAll('.er-drawer-tabs button').forEach(function (b) {
                b.classList.toggle('er-tab-active', b.getAttribute('data-tab') === _erDrawerTab);
            });
            if (_erDrawerTab === 'players') renderReopenedPlayersTab();
            return;
        }

        var originalChildren = Array.prototype.slice.call(box.children);
        var closeBtn = document.getElementById('agp-settings-close-btn');
        var h2 = originalChildren.filter(function (n) { return n.tagName === 'H2'; })[0];
        var fieldNodes = originalChildren.filter(function (n) { return n !== closeBtn && n !== h2; });
        box.innerHTML = '';

        var header = document.createElement('div');
        header.className = 'er-drawer-header';
        if (h2) header.appendChild(h2);
        if (closeBtn) header.appendChild(closeBtn);
        box.appendChild(header);

        var tabs = document.createElement('div');
        tabs.className = 'er-drawer-tabs';
        tabs.innerHTML =
            '<button type="button" data-tab="settings">⚙️ الإعدادات</button>' +
            '<button type="button" data-tab="players">👥 اللاعبون</button>';
        tabs.querySelectorAll('button').forEach(function (btn) {
            btn.classList.toggle('er-tab-active', btn.getAttribute('data-tab') === _erDrawerTab);
            btn.onclick = function () {
                _erDrawerTab = btn.getAttribute('data-tab');
                box.classList.toggle('er-tab-players', _erDrawerTab === 'players');
                tabs.querySelectorAll('button').forEach(function (b) { b.classList.toggle('er-tab-active', b === btn); });
                if (_erDrawerTab === 'players') renderReopenedPlayersTab();
            };
        });
        box.appendChild(tabs);

        // ---- الجسم القابل للسكرول: كل حقول الإعدادات + حقل إدارة
        // اللاعبين كاملاً (قائمته الداخلية مخفية بـCSS، زر "➕ إضافة لوبي
        // جديد" يبقى ظاهراً بمكانه الأصلي، بعد إعادة تسميته). ----
        var bodyWrap = document.createElement('div');
        bodyWrap.className = 'er-drawer-body';
        fieldNodes.forEach(function (n) { bodyWrap.appendChild(n); });
        var reopenBtn = bodyWrap.querySelector('#agp-reopen-registration-btn');
        if (reopenBtn) reopenBtn.textContent = '➕ فتح دخول لاعبين جدد';
        box.appendChild(bodyWrap);

        var playersTab = document.createElement('div');
        playersTab.className = 'er-drawer-players-tab';
        playersTab.id = 'er-players-tab';
        playersTab.innerHTML =
            '<input type="text" id="er-players-tab-search" placeholder="🔍 دوّر على لاعب...">' +
            '<div id="er-players-tab-filter">' +
            '<button type="button" data-filter="all">الكل</button>' +
            '<button type="button" data-filter="live">🟢 نشطون</button>' +
            '<button type="button" data-filter="out">🔴 مقصون</button>' +
            '</div>' +
            '<div id="er-players-tab-list"></div>';
        playersTab.querySelector('#er-players-tab-search').oninput = function () { renderReopenedPlayersTab(); };
        playersTab.querySelectorAll('#er-players-tab-filter button').forEach(function (b) {
            b.classList.toggle('er-filter-active', b.getAttribute('data-filter') === _erPlayersTabFilter);
            b.onclick = function () { _erPlayersTabFilter = b.getAttribute('data-filter'); renderReopenedPlayersTab(); };
        });
        box.appendChild(playersTab);

        if (_erDrawerTab === 'players') renderReopenedPlayersTab();
    }

    /**
     * ⚠️ [0.60.0] نفس منطق روليت القبائل بالحرف — يجمع _alive و_eliminated
     * بقائمة واحدة (كل من شارك بالمباراة)، فلتر بحث بالاسم + فلتر حالة،
     * ترتيب أبجدي عربي. صف نشط = زر × أحمر (manuallyEliminatePlayer)،
     * صف مقصى = زر ↩ أخضر (manuallyRevivePlayer).
     */
    function renderReopenedPlayersTab() {
        var listEl = el('er-players-tab-list');
        if (!listEl) return;

        var query = ((el('er-players-tab-search') || {}).value || '').trim().toLowerCase();
        var rows = _alive.map(function (p) { return { player: p, status: 'live' }; })
            .concat(_eliminated.map(function (e) { return { player: e.player, status: 'out' }; }));

        if (_erPlayersTabFilter !== 'all') {
            rows = rows.filter(function (r) { return r.status === _erPlayersTabFilter; });
        }
        if (query) {
            rows = rows.filter(function (r) { return playerLabel(r.player).toLowerCase().indexOf(query) !== -1; });
        }
        rows.sort(function (a, b) { return playerLabel(a.player).localeCompare(playerLabel(b.player), 'ar'); });

        var filterWrap = el('er-players-tab-filter');
        if (filterWrap) {
            filterWrap.querySelectorAll('button').forEach(function (b) {
                b.classList.toggle('er-filter-active', b.getAttribute('data-filter') === _erPlayersTabFilter);
            });
        }

        if (!rows.length) {
            listEl.innerHTML = '<div style="text-align:center;color:#6b6280;font-size:0.78em;padding:20px 0;">ولا لاعب مطابق</div>';
            return;
        }

        listEl.innerHTML = rows.map(function (r) {
            var isLive = r.status === 'live';
            var actionHtml = isLive
                ? '<button type="button" class="er-prow-action er-action-eliminate" data-id="' + escapeHtml(r.player.id) + '" title="إقصاء يدوي">✕</button>'
                : '<button type="button" class="er-prow-action er-action-revive" data-id="' + escapeHtml(r.player.id) + '" title="إرجاع يدوي">↩</button>';
            return '<div class="er-prow' + (isLive ? '' : ' er-prow-out') + '">' +
                '<span class="er-prow-avatar">' + ringAvatarHtml(r.player) + '</span>' +
                '<span class="er-prow-name">' + escapeHtml(playerLabel(r.player)) + '</span>' +
                '<span class="er-prow-status ' + (isLive ? 'er-status-live' : 'er-status-out') + '">' + (isLive ? 'نشط' : 'مقصى') + '</span>' +
                actionHtml +
                '</div>';
        }).join('');

        listEl.querySelectorAll('.er-action-eliminate').forEach(function (btn) {
            btn.onclick = function () { manuallyEliminatePlayer(btn.getAttribute('data-id')); };
        });
        listEl.querySelectorAll('.er-action-revive').forEach(function (btn) {
            btn.onclick = function () { manuallyRevivePlayer(btn.getAttribute('data-id')); };
        });
    }

    /**
     * ⚠️ إقصاء يدوي هادئ من لوحة الإعدادات — بعكس eliminatePlayer()،
     * بدون تبويب إعلان نتيجة ولا صوت احتفالي؛ فقط نقل اللاعب من _alive
     * لـ_eliminated + تحديث العجلة/البكرة + سطر بانر بسيط.
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
     * ⚠️ إرجاع يدوي فوري من لوحة الإعدادات — بدون فحص _friendRevivedIds
     * (بعكس آلية "انعاش صديق" التلقائية بالعجلة/البكرة)، بلا تبويب
     * "عودة لاعب" الاحتفالي — إجراء إداري هادئ.
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

    // ⚠️ [0.55.0] نافذة "إضافة لوبي جديد" — تصميم جديد بطلب صريح: نافذة
    // مركزية 700×800، شفافية 70% (نفس نموذج rr-mini-lobby-active بروليت
    // الروسي)، حدود بلون واحد، شبكة 3 أعمدة ببطاقات 45px متقاربة (بلا
    // فجوة صف — نفس المعاينة المعتمدة)، زر ✕ للإغلاق يرجّع لدرج
    // الإعدادات دون تصفيره (نفس أسلوب استرجاع طبقة الاتصال أعلاه: نداء
    // AGP.gameShell.setSetting() بنفس القيمة الحالية لأي حقل يجبر
    // الملف المشترك يعيد renderSettingsScreen(true) من الخارج).
    function closeMiniLobbyToSettings() {
        if (AGP.gameShell && typeof AGP.gameShell.setSetting === 'function') {
            var s = AGP.gameShell.getSettings();
            var firstKey = Object.keys(s)[0];
            if (firstKey !== undefined) AGP.gameShell.setSetting(firstKey, s[firstKey]);
        }
    }

    function enhanceMiniLobby() {
        var box = el('agp-shell-box');
        if (!box || !document.getElementById('agp-mini-lobby-list')) return;
        box.classList.remove('er-inmatch-drawer', 'er-tab-players');
        box.classList.add('er-mini-lobby-active');

        var doneBtn = document.getElementById('agp-mini-lobby-done-btn');
        if (doneBtn && doneBtn.textContent.indexOf('حفظ') === -1) {
            doneBtn.textContent = '💾 حفظ وإكمال المباراة';
        }
        if (!box.querySelector('.er-mini-lobby-close-btn')) {
            var closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'er-mini-lobby-close-btn';
            closeBtn.textContent = '✕';
            closeBtn.onclick = closeMiniLobbyToSettings;
            box.insertBefore(closeBtn, box.firstChild);
        }
    }

    function applyShellEnhancements() {
        enhanceSettingsScreen();
        enhanceReopenedDrawer();
        enhanceMiniLobby();
        enhanceWheelModeField();
        // ⚠️ [0.48.x] لا حاجة لأي معالجة يدوية لقائمة اللوبي هنا بعد
        // الآن — الملف المشترك (renderLobbyPlayerList) يبني زر الحذف
        // والـMarquee وأحجام البطاقات تلقائياً بنفسه. راجع تعليق الحذف
        // أعلى enhanceLobbyHeading() لتفاصيل ما كان هنا سابقاً.
        enhanceLobbyHeading();
        enhanceLobbyWatermarkAndActions();
    }

    /* ======================================================================
     *  ⚠️ [0.53.0] طبقة "جاري الاتصال بالبث" فوق شاشة الإعدادات — بطلب
     *  صريح: بدل ما تُستبدَل شاشة الإعدادات بالكامل بصندوق الاتصال
     *  المشترك (agp-connecting-box)، نعترض العملية محلياً (صفر تعديل
     *  على js/agp-game-shell.js): نلتقط نسخة بصرية (clone، غير تفاعلية)
     *  من شاشة الإعدادات لحظة الضغط على الزر — قبل ما الملف المشترك
     *  يبدأ فعلياً بالكتابة فوق #agp-shell-box — ونعرضها مغبّشة خلف
     *  طبقتنا الخاصة (سبينر أثناء الاتصال، علامة ✕ حمراء عند الفشل).
     *  صندوق الاتصال الأصلي نفسه يُخفى بصرياً (visibility:hidden عبر
     *  CSS فقط) طول ما طبقتنا ظاهرة، فما يظهر ازدواج.
     *  عند الفشل: تُغلق الطبقة تلقائياً بعد مهلة قصيرة، وترجع شاشة
     *  الإعدادات الحقيقية (تعمل فعلياً، بلا تصفير) عبر إعادة نداء
     *  AGP.gameShell.setSetting() بنفس القيمة الحالية لأي حقل — هذي
     *  الدالة الوحيدة المُصدَّرة رسمياً من الملف المشترك اللي تجبره على
     *  إعادة renderSettingsScreen() من الخارج، فتُبنى الحقول من جديد
     *  بحالتها الحالية (كل حقول الأزرار/المفاتيح محفوظة أصلاً بكائن
     *  _settingsValues الداخلي، يبقى فقط حقل "الكلمة المفتاحية" يحتاج
     *  استرجاع يدوي من نسخة احتياطية محلية لأنه النص الوحيد بلا تخزين
     *  دائم بالملف المشترك).
     * ==================================================================== */
    var _erConnLayer = null;
    var _erConnKeywordBackup = '';
    var _erConnKeywordPending = false;
    var _erConnErrorShown = false;
    var _erConnErrorTimer = null;

    function ensureConnLayer() {
        if (_erConnLayer) return _erConnLayer;
        var layer = document.createElement('div');
        layer.id = 'er-conn-layer';
        layer.innerHTML =
            '<div class="er-conn-backdrop"></div>' +
            '<div class="er-conn-modal">' +
                '<div class="er-conn-icon"></div>' +
                '<h3 class="er-conn-title"></h3>' +
                '<p class="er-conn-sub"></p>' +
            '</div>';
        document.body.appendChild(layer);
        _erConnLayer = layer;
        return layer;
    }

    function showConnLayer(isError, title, sub) {
        var layer = ensureConnLayer();
        var modal = layer.querySelector('.er-conn-modal');
        var icon = layer.querySelector('.er-conn-icon');
        modal.classList.toggle('er-conn-err', isError);
        icon.className = 'er-conn-icon ' + (isError ? 'er-conn-err-icon' : 'er-conn-spinner');
        icon.textContent = isError ? '✕' : '';
        layer.querySelector('.er-conn-title').textContent = title;
        layer.querySelector('.er-conn-sub').textContent = sub || '';
        layer.classList.add('show');
    }

    function hideConnLayer() {
        if (_erConnLayer) _erConnLayer.classList.remove('show');
    }

    // يُلتقَط لحظة الضغط فقط (قبل ما الملف المشترك يمسح محتوى الصندوق) —
    // نسخة بصرية غير تفاعلية (pointer-events:none عبر CSS) تُعرض مغبّشة
    // خلف طبقتنا، بلا أي مساس بالعناصر الحقيقية (الملف المشترك يقرأ
    // اليوزرنيم/الكلمة المفتاحية من العناصر الأصلية بعدنا مباشرة بلا
    // تأثير).
    document.addEventListener('click', function (e) {
        if (!e.target || e.target.id !== 'agp-connect-btn') return;
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('er-settings-initial-box')) return;
        var kInput = el('agp-keyword');
        _erConnKeywordBackup = kInput ? kInput.value : '';
        var ghost = box.cloneNode(true);
        ghost.removeAttribute('id');
        var layer = ensureConnLayer();
        var backdrop = layer.querySelector('.er-conn-backdrop');
        backdrop.innerHTML = '';
        backdrop.appendChild(ghost);
        _erConnErrorShown = false;
        showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
    }, true);

    // تُستدعى من applyShellEnhancements() (تراقَب مع أي تغيّر بمحتوى
    // #agp-shell-box عبر MutationObserver الموجود أصلاً) — تُطابِق حالة
    // طبقتنا مع حالة الاتصال الفعلية الحالية.
    function syncConnLayer() {
        var box = el('agp-shell-box');
        if (!box) return;

        if (box.classList.contains('agp-conn-error')) {
            if (!_erConnErrorShown) {
                _erConnErrorShown = true;
                var subEl = box.querySelector('.agp-shell-status');
                showConnLayer(true, 'تعذّر الاتصال', subEl ? subEl.textContent : 'تحقّق من اليوزرنيم وحاول مرة أخرى.');
                clearTimeout(_erConnErrorTimer);
                _erConnErrorTimer = setTimeout(function () {
                    hideConnLayer();
                    if (AGP.gameShell && typeof AGP.gameShell.setSetting === 'function') {
                        var s = AGP.gameShell.getSettings();
                        var firstKey = Object.keys(s)[0];
                        if (firstKey !== undefined) AGP.gameShell.setSetting(firstKey, s[firstKey]);
                    }
                    _erConnKeywordPending = true;
                }, 2400);
            }
            return;
        }

        if (box.classList.contains('agp-connecting-box')) {
            // ⚠️ [تدقيق شامل] إصلاح خلل حقيقي: لو وصلت حالة "connecting"
            // جديدة (إعادة اتصال تلقائية) بينما مؤقّت استرجاع الإعدادات
            // من حالة خطأ سابقة (_erConnErrorTimer) لسا شغّال، كان يبقى
            // معلَّقاً ويطلق renderSettingsScreen() لاحقاً فوق محاولة
            // اتصال جديدة قائمة فعلياً — يلغيه هنا فوراً.
            clearTimeout(_erConnErrorTimer);
            _erConnErrorShown = false;
            // اتصال جارٍ (أول ضغطة، أو إعادة اتصال تلقائية بدون ضغطة
            // جديدة) — الطبقة أصلاً ظاهرة لو صدرت من ضغطة الزر؛ لو صدرت
            // من حدث خارجي (بدون ghost جديد) نعرضها بأحدث حالة متاحة.
            if (!_erConnLayer || !_erConnLayer.classList.contains('show')) {
                showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
            }
            return;
        }

        // خرجنا من حالتي الاتصال/الخطأ تماماً.
        clearTimeout(_erConnErrorTimer);
        _erConnErrorShown = false;
        if (box.classList.contains('agp-lobby-box')) {
            hideConnLayer();
        }
        if (_erConnKeywordPending && box.classList.contains('er-settings-initial-box')) {
            var kInput = el('agp-keyword');
            if (kInput) kInput.value = _erConnKeywordBackup;
            _erConnKeywordPending = false;
        }
    }

    function wireSharedShellEnhancements() {
        applyShellEnhancements();
        syncConnLayer();
        var overlay = el('agp-shell-overlay');
        if (!overlay) return;
        var observer = new MutationObserver(function () {
            applyShellEnhancements();
            syncConnLayer();
        });
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
            category: 'elimination-games',

            onLoad: function () {
                AGP.log('Elimination Roulette: onLoad.');
            },
            onPlayerJoin: function () {
                enforceMaxPlayers();
            },
            onRoundEnd: function () {
                AGP.log('Elimination Roulette: onRoundEnd.');
            },
            onDestroy: function () {
                resetMatchState();
                AGP.log('Elimination Roulette: onDestroy — match state cleared.');
            }
        });

        if (!registered) {
            AGP.log('Elimination Roulette: registration failed (already registered?).');
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
            settingsTitle: 'إعدادات لعبة روليت الإقصاء',
            gameExplanation: 'تدور العجلة وتتوقف عند أحد اللاعبين، فيختار رقم لاعب آخر ليقصيه من الشات. ' +
                'لو وقفت العجلة على نفس الشخص مرتين متتاليتين (ولو مفعّلة ميزة انعاش صديق)، يقدر يرجّع مُقصى بدل الإقصاء ' +
                '(كل مُقصى يترجّع بهذي الطريقة مرة واحدة فقط طول المباراة). ' +
                'المُقصى يقدر يرجع بإرسال هدية معيّنة لو مفعّلة ميزة الإنعاش بالدعم. تستمر المباراة حتى يبقى لاعب واحد.',
            connectButtonLabel: 'الاتصال بالبث والانتقال للوبي',
            minPlayersToStart: 2,
            logoImage: '../../logo.png',
            homeUrl: '../../index.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
            // ⚠️ [0.55.0] midMatchToggleButton (زر "العب التلقائي" داخل درج
            // الإعدادات) أُزيل من هنا بطلب صريح — الزر صار عنصراً محلياً
            // مستقلاً تحت العجلة مباشرة بشاشة اللعب (راجع renderStage/
            // updateAutoPlayBtnLabel أعلاه)، خارج درج الإعدادات تماماً.
            // handleAutoPlayToggle نفسها بلا أي تغيير — فقط مصدر النداء تغيّر.
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
