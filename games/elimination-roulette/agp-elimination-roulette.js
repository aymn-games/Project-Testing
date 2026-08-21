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

    function injectStageStyles() {
        if (el('er-stage-styles')) return;
        ensureZainFont();
        var style = document.createElement('style');
        style.id = 'er-stage-styles';
        style.textContent = [
            ':root{--er-accent:' + C_ACCENT + ';--er-accent2:' + C_ACCENT2 + ';--er-pink:' + C_PINK + ';}',

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
            '#er-modal-overlay{position:fixed;inset:0;z-index:100010;display:none;flex-direction:column;',
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
            // ⚠️ [0.45.8] تبويب "اختيار الإقصاء" تحديداً يتميّز بحدّ وعنوان
            // أخضرين (بدل الأساسي البنفسجي) — طلب صريح، بينما تبويب
            // "انعاش الصديق" (نفس الصندوق، roleClass مختلف) يبقى بالمظهر
            // الأساسي بدون تمييز. الكلاس er-role-eliminate/er-role-revive
            // يُضاف على #er-modal-box نفسه من renderTurnModal() (بدل
            // تفريغه بالكامل كما كان سابقاً).
            '#er-modal-box.er-role-eliminate{border-color:#22c55e;}',
            '#er-modal-box.er-role-eliminate h2{color:#22c55e;}',
            /* اسم صاحب الدور وكلمة "يختار!" — كل وحدة مميَّزة بلون مختلف
             * ⚠️ [0.45.0] طلب صريح: تمييز الاسم عن كلمة "يختار!" بألوان
             * مختلفة (كانا سطراً واحداً بلون واحد سابقاً) — يطبَّق تلقائياً
             * على نافذتي الإقصاء والإرجاع لأنهما يستخدمان نفس الدالة. */
            /* ---- [0.46.0] "بطاقة اختيار" فوق نافذة الدور — تحل محل نص
             * "الاسم يختار!" القديم بالكامل. دائرة أفاتار بحلقة ملوَّنة
             * (أخضر لنافذة الإقصاء، أحمر لنافذة الإرجاع — بالضبط كما أكّد
             * المستخدم رغم كونه عكس المتوقَّع منطقياً) + الاسم تحتها. */
            '#er-modal-chooser-card{display:none;flex-direction:column;align-items:center;gap:6px;}',
            '.er-chooser-card-ring{position:relative;width:110px;height:110px;border-radius:50%;',
            'padding:5px;box-sizing:border-box;}',
            '.er-chooser-card-ring.er-role-eliminate{background:#22c55e;box-shadow:0 0 22px rgba(34,197,94,0.65);}',
            '.er-chooser-card-ring.er-role-revive{background:#ef4444;box-shadow:0 0 22px rgba(239,68,68,0.65);}',
            '.er-chooser-card-inner{width:100%;height:100%;border-radius:50%;background:#2D1932;overflow:hidden;}',
            '.er-chooser-card-name{font-size:1.15em;font-weight:900;color:#fff;text-align:center;}',
            // ⚠️ [0.45.7] زرّا تحكّم يدوي جديدان للمضيف — يظهران فقط بنافذة
            // الإقصاء (roleClass er-role-eliminate)، مبنيان بـchooserCardHtml().
            // بديل يدوي اختياري لآلية كتابة الرقم بشات البث الموجودة أصلاً
            // — الاثنان يبقيان شغّالين معاً (لا إلغاء لأي منهما).
            // ⚠️ [0.45.12] تعديل صريح: الزرّان كانا فوق بعض عمودياً (column)
            // بعرض 200px موحّد للاثنين — صار بجانب بعض أفقياً (row) بطلب
            // المستخدم، كل زر ياخذ نصف المساحة (flex:1) بدل عرض ثابت.
            // ⚠️ [0.45.13] إصلاح: width:100% كانت تحسب نسبة لعرض الحاوية
            // الأب (#er-modal-chooser-card) اللي بدورها auto-width بحجم
            // أضيق محتوى (حلقة الأفاتار 110px) — فعملياً الصف كان يضيق
            // كثيراً (~277px)، ونص زر "إقصاء صاحب الدور" كان ينكسر
            // لسطرين ويطوّل الزر — طلب صريح: عرض ثابت أوسع (380px) بدل
            // النسبة المئوية، يفرض على الحاوية الأب تتوسع لتلائمه، فيصير
            // فيه مساحة كافية لكل النص بسطر وحد + الزر يصير أقصر ارتفاعاً.
            '.er-chooser-actions{display:flex;flex-direction:row;gap:8px;margin-top:12px;',
            'width:380px;max-width:92vw;}',
            '.er-chooser-action-btn{flex:1;padding:9px 8px;border-radius:999px;border:none;font-weight:800;',
            'cursor:pointer;font-family:inherit;font-size:0.85em;color:#fff;white-space:nowrap;',
            'line-height:1.3;transition:transform 0.15s,box-shadow 0.15s;}',
            '.er-chooser-action-btn:hover{transform:translateY(-2px);}',
            '.er-chooser-action-eliminate{background:linear-gradient(90deg,#ef4444,#b91c1c);',
            'box-shadow:0 4px 14px rgba(239,68,68,0.45);}',
            '.er-chooser-action-resume{background:linear-gradient(90deg,var(--er-accent2),var(--er-accent));',
            'box-shadow:0 4px 14px rgba(124,58,237,0.45);}',
            '#er-modal-sub{text-align:center;color:#e9d3ff;font-size:0.95em;margin-bottom:10px;}',
            '#er-modal-timer{text-align:center;font-weight:900;font-size:2.2em;color:#ffe066;margin-bottom:16px;',
            'transition:color 0.2s;}',
            '#er-modal-timer.er-timer-warning{color:#ff4d6d;animation:er-pulse 1s infinite;}',
            '@keyframes er-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.08);}}',

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
            '#er-candidates-grid{display:flex;flex-flow:row wrap;gap:14px;justify-content:center;',
            'width:100%;max-width:1180px;margin:0 auto;}',
            '.er-candidate-card{display:flex;align-items:center;gap:10px;cursor:pointer;',
            'width:290px;box-sizing:border-box;background:#000;border:1px solid rgba(255,255,255,0.18);',
            'border-radius:16px;padding:10px 14px;transition:background 0.15s,transform 0.15s;}',
            '.er-candidate-card:hover{background:#1a1a1a;transform:translateY(-2px);}',
            '.er-candidate-num{color:#000000;border-radius:50%;width:34px;height:34px;flex-shrink:0;',
            'display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.95em;}',
            // ⚠️ [0.45.8] رقم بطاقة "الإقصاء" تحديداً صار أخضر مميَّز (بدل
            // اللون البنفسجي الأساسي) — طلب صريح لتمييز تبويب الإقصاء عن
            // بقية التبويبات، بنفس الأخضر المستخدم أصلاً بحلقة "صاحب
            // الدور" (er-role-eliminate) لنفس النافذة، للتناسق.
            // ⚠️ [0.45.13] طلب صريح: رقم البادج الأخضر (الإقصاء) تحديداً
            // يكبر ويكون أوضح أكثر من الرقم الأساسي (34px) — البادج
            // الأرجواني (نافذة الإرجاع) يبقى بحجمه بدون تغيير.
            '.er-candidate-num.er-role-eliminate{background:#22c55e;width:40px !important;',
            'height:40px !important;font-size:1.15em !important;}',
            // ⚠️ [0.45.13] شارة "🔴 مرحلة الإقصاء" — تظهر فقط بأعلى نافذة
            // اختيار الإقصاء (isEliminate)، طلب صريح لتوضيح المرحلة
            // الحالية للمشاهدين بالبث.
            '.er-phase-badge-wrap{text-align:center;margin-bottom:8px;}',
            '.er-phase-badge{display:inline-block;padding:4px 16px;border-radius:999px;',
            'background:rgba(34,197,94,0.18);border:1px solid rgba(34,197,94,0.65);color:#22c55e;',
            'font-weight:900;font-size:0.85em;letter-spacing:0.3px;}',
            // ⚠️ بطاقة اللاعب المشتركة (agp-pcard) داخل شبكة المرشَّحين هنا
            // فقط — تكبير الصورة/الاسم بمحدِّدات مقيَّدة بـ#er-candidates-grid
            // (لا تلمس .agp-pcard بأي مكان آخر بالمنصة، ولا الملف المشترك
            // نفسه) + !important لضمان الأولوية بغضّ النظر عن ترتيب حقن
            // الأنماط بين هذا الملف وjs/agp-player-card.js.
            '#er-candidates-grid .agp-pcard{display:flex !important;flex:1;flex-direction:row-reverse;',
            'align-items:center;gap:10px;min-width:0;}',
            '#er-candidates-grid .agp-pcard-avatar-basic{width:47px !important;height:47px !important;',
            'flex-shrink:0;}',
            // ⚠️ [0.45.12] المستخدم طلب "1.20em و 17px" لخط اسم المرشَّح —
            // القيمتان لا تتطابقان تماماً إلا بافتراض حجم أساس غير معتاد،
            // فاستُخدمت القيمة الصريحة غير الملتبسة (17px) مباشرةً.
            '#er-candidates-grid .agp-pcard-name-basic{font-size:17px !important;font-weight:800 !important;',
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
            '.er-candidate-num.er-role-revive{background:var(--er-accent2);}',

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
            '#er-modal-box.er-announce-box{width:650px;max-width:92vw;height:auto;max-height:300px;',
            'display:flex;align-items:center;justify-content:center;padding:30px 24px;}',
            '.er-announce-box .er-announce-sentence{font-size:1.25em;font-weight:800;text-align:center;',
            'line-height:2.4;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;}',
            '.er-announce-person{display:inline-flex;flex-direction:column;align-items:center;gap:4px;',
            'vertical-align:middle;}',
            '.er-announce-avatar-wrap{display:block;width:106px;height:106px;border-radius:50%;position:relative;}',
            '.er-announce-avatar-wrap .er-ring-avatar,.er-announce-avatar-wrap .er-ring-avatar--fallback{',
            'width:106px;height:106px;}',
            '.er-announce-person-name{font-size:0.55em;font-weight:800;color:#fff;}',
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
            /* بطاقة إنعاش-بالهدية العائمة (toast غير مقاطِع — راجع showGiftReviveCard) */
            '.er-gift-revive-card{display:flex;align-items:center;gap:10px;background:rgba(20,8,35,0.95);',
            'border:1px solid rgba(74,222,128,0.55);color:#f3eefc;padding:8px 18px 8px 8px;border-radius:999px;',
            'font-size:0.85em;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,0.4);}',
            '.er-gift-revive-card .er-announce-avatar-wrap{width:40px;height:40px;}',
            '.er-gift-revive-card .er-announce-avatar-wrap .er-ring-avatar,',
            '.er-gift-revive-card .er-announce-avatar-wrap .er-ring-avatar--fallback{width:40px;height:40px;font-size:0.8em;}',

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
            '#er-winner-box{text-align:center;}',
            '#er-winner-box h2{font-family:Almarai,Cairo,sans-serif;font-size:1.6em;color:#fff;}',
            '.er-trophy-cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin:14px 0 18px;}',
            /* ⚠️ [0.46.0] حجم موحَّد 250×250 لكل بطاقة، وبدون أي خلفية أو
             * حدود إطلاقاً (أُلغيتا بالكامل) — تأثير "تطاير" (confetti)
             * هو البديل الاحتفالي الآن، راجع spawnConfetti().
             * ⚠️ [0.47.0] تأثير "إشعاع/توهّج" جديد حول كل بطاقة (نفس اللون
             * الموحَّد للطرفين — الفائز والأكثر إقصاءً — بطلب صريح)، مع
             * نبضة خفيفة مستمرة. overflow صار visible بدل hidden حتى لا
             * يُقصّ التوهّج (ولا قصاصات confetti التي تتخطى حدود الصندوق
             * أحياناً — إصلاح فني إضافي وُجد أثناء المراجعة). */
            '.er-trophy-card{position:relative;width:250px;height:250px;box-sizing:border-box;',
            'border-radius:18px;padding:20px 14px;display:flex;flex-direction:column;align-items:center;',
            'justify-content:center;overflow:visible;background:none;border:none;',
            'box-shadow:0 0 55px 14px rgba(255,255,255,0.4),0 0 120px 35px rgba(216,120,255,0.6);',
            'animation:er-trophy-glow-pulse 2.6s ease-in-out infinite;}',
            '@keyframes er-trophy-glow-pulse{0%,100%{box-shadow:0 0 55px 14px rgba(255,255,255,0.4),',
            '0 0 120px 35px rgba(216,120,255,0.6);}',
            '50%{box-shadow:0 0 75px 22px rgba(255,255,255,0.6),0 0 150px 45px rgba(216,120,255,0.78);}}',
            '.er-trophy-card .er-trophy-label{font-size:0.85em;font-weight:800;color:#fff;margin-bottom:10px;}',

            '.er-ring-wrap{position:relative;width:88px;height:88px;margin:0 auto 10px;border-radius:50%;',
            'padding:5px;box-sizing:border-box;}',
            '.er-ring-winner{background:conic-gradient(from 0deg,#ffd400,#fff6cf,#ffd400,#c9960a,#ffd400);',
            'box-shadow:0 0 20px rgba(255,212,0,0.55);}',
            '.er-ring-most{background:repeating-conic-gradient(' + C_PINK + ' 0deg 18deg,' + C_PINK_DK + ' 18deg 36deg);',
            'box-shadow:0 0 20px rgba(255,77,255,0.4);}',
            '.er-ring-inner{width:100%;height:100%;border-radius:50%;background:#2D1932;overflow:hidden;}',
            '.er-ring-avatar{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#5a2585;display:block;}',
            '.er-ring-avatar--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#fff;font-weight:800;font-size:1.4em;}',
            '.er-ring-badge{position:absolute;bottom:-2px;right:-2px;width:28px;height:28px;border-radius:50%;',
            'display:flex;align-items:center;justify-content:center;font-size:0.95em;border:2px solid #2D1932;}',
            '.er-ring-badge.er-badge-winner{background:#ffd400;}',
            '.er-ring-badge.er-badge-most{background:var(--er-pink);}',

            '.er-trophy-name{font-size:1.15em;font-weight:900;color:#fff;}',
            '.er-trophy-count{color:#e9d3ff;font-size:0.85em;margin-top:4px;}',

            /* ---- عرض النقاط المكتسبة ---- */
            '.er-trophy-points{margin-top:10px;font-size:0.85em;line-height:1.4;}',
            '.er-trophy-points.er-points-earned{color:#ffd400;font-weight:800;}',
            '.er-trophy-points .er-points-sub{display:block;color:#e9d3ff;font-weight:500;font-size:0.85em;margin-top:2px;}',
            '.er-trophy-points.er-points-noaccount{color:#e9d3ff;font-size:0.8em;}',

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
            '#agp-shell-box.agp-lobby-box{background:linear-gradient(180deg,#5F3976,#211528) !important;position:relative;overflow:hidden;}',

            /* ---- [0.45.12] تعديلات إضافية على صندوق الإعدادات/اللوبي
             * المشترك (#agp-shell-box) — كل القواعد هنا !important ومحقونة
             * من هذا الملف فقط (بعد تنسيق الملف المشترك)، فتطغى فقط على
             * صفحة روليت الإقصاء دون لمس js/agp-game-shell.js إطلاقاً. */

            // ⚠️ زر إغلاق الإعدادات (✕) كان بلون بنفسجي غامق (#5a2585) قليل
            // التباين — طلب صريح: يكون بارزاً وأبيض واضح.
            '#agp-settings-close-btn{color:#ffffff !important;font-weight:900 !important;',
            'text-shadow:0 1px 4px rgba(0,0,0,0.5) !important;}',

            // ⚠️ [0.45.14] طلب صريح (تصميم Figma مُزوَّد): صندوق اللوبي
            // برجع لارتفاع ثابت — 900px هذي المرة (بدل 800px الأصلي وبدل
            // auto اللي جربناها بـ[0.45.12]) — بحد أقصى 92vh للشاشات
            // الأقصر. تنبيه صادق: لو عدد اللاعبين كبير جداً، المحتوى
            // يتجاوز 900px ويصير سكرول داخل الصندوق نفسه (overflow-y:auto
            // موروثة من القاعدة الأساسية #agp-shell-box) — هذا تحديداً
            // الفرق بين الخيارين اللي عُرضا على المستخدم، واختار الثابت.
            '#agp-shell-box.agp-lobby-box{height:900px !important;max-height:92vh !important;',
            'overflow-y:auto !important;}',

            // ⚠️ شعار "Ayman Games" كخلفية شفافة (25%) بمنتصف صندوق اللوبي —
            // طلب صريح. يُضاف كعنصر img عبر enhanceLobbyWatermarkAndActions()،
            // هذا فقط موضعته/شفافيته.
            '#er-lobby-watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
            'width:55%;max-width:420px;opacity:0.25;pointer-events:none;z-index:0;}',
            // العناصر الحقيقية بصندوق اللوبي فوق الشعار دائماً.
            '#agp-shell-box.agp-lobby-box > *:not(#er-lobby-watermark){position:relative;z-index:1;}',

            // ⚠️ [0.45.14] تدرّج جديد خاص باللوبي فقط (5D336A→000000 —
            // من صورة Figma زوَّدنا بها المستخدم)، يستبدل التدرّج الموحَّد
            // (5F3976→211528) المستخدَم بباقي الشاشات (الإعدادات، تبويبي
            // الإقصاء/الإرجاع، بطاقة الفائز) — تلك تبقى بتدرّجها القديم
            // بدون تغيير، القاعدة `#agp-shell-box{...}` (بدون .agp-lobby-box)
            // ما تغيّرت. محدِّد `.agp-lobby-box` أعلى تخصيصاً فيطغى هنا فقط.
            '#agp-shell-box.agp-lobby-box{background:linear-gradient(180deg,#5D336A,#000000) !important;',
            'position:relative;overflow:hidden;}',

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

            // ⚠️ [0.45.14] إعادة تصميم شبكة بطاقات اللاعبين باللوبي —
            // يستبدل تكبير zoom الموحَّد لكل البطاقات ([0.45.12]/[0.45.13])
            // بتصميمين منفصلين حسب نوع البطاقة (تفصيل كامل بالتعليقات
            // أدناه)، بطلب صريح مبني على تصميم Figma مُزوَّد + توضيح
            // صريح لعدد الأعمدة (3 بالضبط، وليس تلقائي).
            // ⚠️ [0.45.15] margin-top إضافي — طلب صريح لحل قصّ بصري ظاهر
            // بأعلى الصف الأول من البطاقات (ملتصقة بصف التلميح/الكلمة
            // المفتاحية فوقها)، بنزول ~1 سم تقريباً.
            // ⚠️ [0.45.16] طلب صريح: تقريب البطاقات من بعض (gap 18→10px)
            // مع إبقاء 3 أعمدة بالضبط + ارتفاع أدنى موحَّد لكل صف
            // (min-height على li) حتى تتساوى الصفوف طولياً بين البطاقات
            // المؤطَّرة (~83px) والأساسية (~84px) رغم اختلاف نظام كل نوع.
            // ⚠️ [0.45.18] طلب صريح: تقليص تلقائي لحجم البطاقات لو عدد
            // اللاعبين كبير (أكثر من 15 — أكثر من 5 صفوف) حتى يظهر الكل
            // بدون أي قصّ بصري، بدل الاعتماد على السكرول الداخلي. القيم
            // أدناه صارت متغيرات CSS (custom properties) بدل أرقام ثابتة
            // — applyDynamicLobbyCardScale() تحسبها وتحقنها ديناميكياً
            // حسب عدد اللاعبين الفعلي + المساحة الرأسية المتاحة فعلياً
            // (مقاسة من list.clientHeight)، وتُعاد الحساب تلقائياً مع كل
            // انضمام/مغادرة لاعب (نفس MutationObserver الموجود أصلاً).
            // القيم الافتراضية (fallback) هي أرقام الحجم الكامل المعتمدة.
            // ⚠️ [0.45.19] طلب صريح بعد اختبار بأسماء حقيقية (إنجليزية/
            // إيموجي طويلة، عكس أسماء الاختبار القصيرة "لاعب_1"): بلاطة
            // اسم طويلة كانت تتوسّع حتى الحد الأقصى (520px) وتفرض على
            // شبكة 3 أعمدة عرضاً أكبر من المتاح فعلياً — يسبب فيض أفقي
            // حقيقي (سكرول جانبي + قصّ بصري للعمود الأول). المحاولة
            // الأولى (تبديل كامل الشبكة لعمودين) كانت أوسع من المطلوب —
            // طلب المستخدم صراحةً إبقاء 3 أعمدة كقاعدة عامة، وفقط
            // البطاقة صاحبة الاسم الطويل تاخذ عرض عمودين (`grid-column:
            // span 2`) بدل تغيير الشبكة كلها. الفحص (markWideLobbyCards)
            // يحدد لكل بطاقة على حدة هل عرضها الطبيعي أكبر من عرض عمود
            // واحد متاح، ويضيف كلاس `.er-lobby-card-wide` لها فقط لو
            // كذا. `grid-auto-flow:dense` يسمح للبطاقات القصيرة اللاحقة
            // تملأ أي فراغ متبقي بنفس الصف بدل ترك فراغ فارغ.
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{display:grid !important;',
            'grid-template-columns:repeat(3,1fr) !important;grid-auto-flow:dense !important;',
            'gap:var(--er-lobby-grid-gap,10px) !important;',
            'align-items:center !important;justify-items:center !important;margin-top:34px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list li{position:relative;display:flex !important;',
            'align-items:center !important;justify-content:center !important;flex:0 0 auto !important;',
            'min-width:0 !important;padding:4px !important;',
            'min-height:var(--er-lobby-row-min-height,88px) !important;box-sizing:border-box !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list li.er-lobby-card-wide{',
            'grid-column:span 2 !important;}',

            // ---- بطاقة اللاعب الأساسية (بدون إطار) — تصميم "بلاطة اسم +
            // دائرة أفاتار منفصلة بجانبها"، مطابق لصورة Figma:
            // بلاطة الاسم بعرض أدنى 300px (يتوسع تلقائياً لو الاسم طويل،
            // يبقى بالنص لو قصير)، ارتفاع ثابت 80px، خط 40px. الأفاتار
            // دائرة منفصلة 84×84px بجانبها (مو بداخلها). الحاوية الأصلية
            // .agp-pcard صارت شفافة (بدون خلفية/حدود خاصة فيها) — الشكل
            // البصري صار على البلاطة والدائرة نفسهما.
            // ⚠️ [0.45.16] طلب صريح: إزالة الفراغ بين دائرة الأفاتار وبلاطة
            // الاسم — يصيران ملتصقين ببعض (gap:0 بدل 12px).
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list li .agp-pcard{background:none !important;',
            'border:none !important;padding:0 !important;border-radius:0 !important;',
            'max-width:none !important;gap:0 !important;display:flex !important;align-items:center !important;}',
            // ⚠️ [0.45.17] طلب صريح: حجم دائرة الأفاتار 84→75px (الأساس
            // الكامل — [0.45.18] يصغّره أكثر ديناميكياً لو زاد اللاعبين).
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list li .agp-pcard-avatar-basic{',
            'width:var(--er-lobby-avatar-size,65px) !important;height:var(--er-lobby-avatar-size,65px) !important;',
            'border-width:3px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list li .agp-pcard-avatar-basic--fallback{',
            'font-size:1.6em !important;}',
            // ⚠️ [0.45.15] طلب صريح: ارتفاع البلاطة 80→60px، خط الاسم
            // 40→35px (أساس كامل — [0.45.18] يصغّره ديناميكياً أيضاً).
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list li .agp-pcard-name-basic{',
            'display:flex !important;align-items:center !important;justify-content:center !important;',
            'min-width:var(--er-lobby-pill-minw,260px) !important;max-width:var(--er-lobby-pill-maxw,450px) !important;',
            'height:var(--er-lobby-pill-height,52px) !important;',
            'box-sizing:border-box !important;padding:0 20px !important;font-size:var(--er-lobby-font-size,30px) !important;',
            'font-weight:800 !important;background:rgba(255,255,255,0.14) !important;',
            'border:1px solid rgba(255,255,255,0.32) !important;border-radius:999px !important;',
            'white-space:nowrap !important;overflow:hidden !important;text-overflow:ellipsis !important;',
            'line-height:1 !important;}',

            // ---- بطاقة اللاعب المؤطَّرة (عنده إطار مفعَّل) — نظام مختلف
            // كلياً بالملف المشترك (js/agp-player-card.js): قماشة صورة
            // واحدة (إطار+صورة+اسم مدموجين) بأبعاد مبنية حسب نسبة كل
            // ملف إطار على حدة (ارتفاع أساس ثابت 72px بالملف المشترك،
            // ما نقدر نلمسه). تكبير أي جزء بمقاس منفصل (زي 84px أفاتار)
            // بيمدّد صورة الإطار بالقوة ويشوّهها — بدل هذا، تكبير
            // متناسب بالكامل (zoom على القماشة كوحدة واحدة) يقارب نفس
            // الحجم العام (~83px بدل 72px) بدون أي تشويه — بالضبط القرار
            // اللي تم تأكيده صراحة.
            // ⚠️ [0.45.18] نفس نسبة التصغير الديناميكي تنطبق على البطاقات
            // المؤطَّرة أيضاً (zoom أساسه 1.15 يتغيّر مع --er-lobby-scale)
            // حتى تبقى الصفوف متوازنة بالطول مع البطاقات الأساسية بكل
            // الأحجام، بدون أي تشويه (zoom يبقى تكبيراً متناسباً للقماشة
            // كوحدة واحدة دائماً، بغضّ النظر عن قيمته).
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list li .agp-pcard-tpl{',
            'zoom:var(--er-lobby-frame-zoom,1.00) !important;}',

            // ⚠️ زر "✕" لإقصاء لاعب يدوياً قبل بدء المباراة (بطاقات اللوبي) —
            // يُضاف كعنصر عبر enhanceLobbyList()، هذا فقط شكله. حجمه بقي
            // بدون تغيير (طلب صريح: "حجم قريب من الحالي").
            '.er-lobby-remove-btn{position:absolute;top:-6px;left:-6px;width:22px;height:22px;',
            'border-radius:50%;background:#ef4444;color:#fff;border:2px solid #211528;',
            'font-weight:900;font-size:13px;line-height:18px;text-align:center;cursor:pointer;',
            'box-shadow:0 2px 6px rgba(0,0,0,0.5);z-index:2;}',

            // ⚠️ [0.45.15] صف أزرار اللوبي السفلي — طلب صريح جديد: الثلاثة
            // أزرار (العودة للإعدادات، بدء الجولة، رجوع للمنصة) بصف واحد
            // جنب بعض، بنفس المقاس بالضبط (W360×H48)، بدل صفّين متفاوتَي
            // الحجم كما كان بـ[0.45.14]. المقاس ثابت (مو flex:1) + الصف
            // نفسه في المنتصف (justify-content:center).
            '.er-lobby-actions-row{display:flex;gap:14px;margin-top:14px;justify-content:center;',
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
            '.er-back-to-platform-btn:hover{background:rgba(255,255,255,0.18);}'
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
        if (!el('er-toast-wrap')) {
            var toastWrap = document.createElement('div');
            toastWrap.id = 'er-toast-wrap';
            document.body.appendChild(toastWrap);
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
        // ⚠️ [0.46.0] أسماء اللاعبين رجعت مكتوبة داخل قطع العجلة نفسها
        // (renderWheelLabels)، وزر "إعادة ترتيب عشوائية" تحت العجلة.
        // ⚠️ [0.48.0] موشر تكبير/تصغير العجلة بين العجلة والزر — عنصر
        // عادي بترتيب العمود حتى يتحرك الزر تلقائياً معه عند تغيير الحجم.
        stage.innerHTML =
            '<div id="er-wheel-wrap">' +
            '<div id="er-wheel-bezel"></div>' +
            '<div id="er-wheel-pointer"></div>' +
            '<div id="er-wheel"></div>' +
            '<button id="er-spin-hub" title="دوّر العجلة"><img src="../../logo.png" alt="ألعاب أيمن"><span>دور</span></button>' +
            '</div>' +
            '<div id="er-wheel-zoom-row">' +
            '<span>🔍−</span>' +
            '<input type="range" id="er-wheel-zoom-slider" min="' + WHEEL_SIZE_MIN + '" max="' + WHEEL_SIZE_MAX + '" step="10" value="' + _wheelSizePx + '" title="تكبير/تصغير العجلة">' +
            '<span>🔍+</span>' +
            '</div>' +
            '<button id="er-shuffle-btn" type="button">🔀 إعادة ترتيب عشوائية</button>';

        applyWheelSize(_wheelSizePx);
        renderWheelBulbs();
        renderWheelSlices();
        renderWheelLabels();
        el('er-spin-hub').onclick = handleSpinClick;
        el('er-shuffle-btn').onclick = handleShuffleClick;
        el('er-wheel-zoom-slider').oninput = function () {
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

        showResultAnnouncement('revive', {
            target: target,
            chooser: chooserPlayer
        }, function onDone() {
            maybeAutoSpin();
        });
    }

    /* ======================================================================
     *  7) نافذة الدور المشتركة (إقصاء أو إرجاع) — عرض + عدّاد + استماع للشات
     * ==================================================================== */
    function renderTurnModal() {
        var overlay = el('er-modal-overlay');
        var box = el('er-modal-box');
        if (!overlay || !box || !_pendingTurn) return;

        var isRevive = _pendingTurn.type === 'revive';
        var roleClass = isRevive ? 'er-role-revive' : 'er-role-eliminate';
        var title = isRevive ? '🎗️ فرصة إرجاع!' : 'اختيار الإقصاء';
        var subtitle = isRevive
            ? 'وقف عليه العجلة مرتين متتاليتين — يقدر يرجّع لاعب مُقصى! اكتب رقم اللاعب بشات البث، أو اكتب "تخطي" للتجاوز'
            : 'اكتب رقم اللاعب بشات البث للإقصاء';

        var rows = _pendingTurn.candidates.map(function (p, i) {
            return '<div class="er-candidate-card" data-index="' + i + '">' +
                '<span class="er-candidate-num ' + roleClass + '">' + (i + 1) + '</span>' +
                playerCardHtml(p) +
                '</div>';
        }).join('');

        // ⚠️ [0.45.13] طلب صريح: كتابة "مرحلة الإقصاء" داخل نافذة اختيار
        // الإقصاء تحديداً (بدون نافذة الإرجاع) — توضيح إضافي للمشاهدين.
        var phaseBadgeHtml = !isRevive
            ? '<div class="er-phase-badge-wrap"><span class="er-phase-badge">🔴 مرحلة الإقصاء</span></div>'
            : '';

        box.className = roleClass; // ⚠️ [0.45.8] يميّز تبويب الإقصاء بلون أخضر (راجع CSS)
        box.innerHTML =
            phaseBadgeHtml +
            '<h2>' + title + '</h2>' +
            '<div id="er-modal-sub">' + subtitle + '</div>' +
            '<div id="er-modal-timer"></div>' +
            '<div id="er-candidates-grid">' + rows + '</div>';

        // ⚠️ [0.46.0] بطاقة الاختيار (أفاتار+اسم بحلقة ملوَّنة) تظهر فوق
        // الصندوق كعنصر شقيق منفصل بفاصل واضح (gap على #er-modal-overlay)
        // — بدل نص "الاسم يختار!" الملغى بالكامل.
        var chooserCard = el('er-modal-chooser-card');
        if (chooserCard) {
            chooserCard.innerHTML = chooserCardHtml(_pendingTurn.chooser, roleClass, !isRevive);
            chooserCard.style.display = 'flex';
        }

        if (AGP.playerCard) AGP.playerCard.fitAllNames(box);

        box.querySelectorAll('.er-candidate-card').forEach(function (row) {
            row.onclick = function () {
                var i = parseInt(row.getAttribute('data-index'), 10);
                resolveTurnSelection(i);
            };
        });

        // ⚠️ [0.45.7] زرّا تحكّم يدوي — بديل اختياري لكتابة الرقم بشات
        // البث، لا يلغيها (الاثنان يبقيان شغّالين معاً). يظهران فقط
        // بنافذة الإقصاء (chooserCardHtml بنَتهما فقط لو isEliminate=true).
        var eliminateChooserBtn = el('er-chooser-eliminate-btn');
        if (eliminateChooserBtn) {
            eliminateChooserBtn.onclick = function () {
                var chooser = _pendingTurn && _pendingTurn.chooser;
                if (!chooser) return;
                AGP.timerManager.stop(TIMER_NAME);
                eliminatePlayer(chooser, chooser.id);
            };
        }
        var resumeBtn = el('er-chooser-resume-btn');
        if (resumeBtn) {
            resumeBtn.onclick = function () {
                AGP.timerManager.stop(TIMER_NAME);
                closeTurnModal();
                // ⚠️ [0.45.10] نفس تصفير الدوران — راجع تعليق handleSpinClick.
                resetWheelSpinPosition();
                maybeAutoSpin();
            };
        }

        overlay.style.display = 'flex';
    }

    // ⚠️ playerCardHtml معزولة بدالة واحدة — تستخدم AGP.playerCard
    // المشترك (js/agp-player-card.js) بدون إطار (showFrame:false) عمداً؛
    // نافذتا الإقصاء/الإرجاع تعرض البطاقة الأساسية دائماً حتى لو اللاعب
    // يملك إطاراً مفعَّلاً (الإطار يظهر باللوبي فقط، قرار موثَّق أصلاً).
    function playerCardHtml(p) {
        if (!AGP.playerCard) return '<span>' + escapeHtml(playerLabel(p)) + '</span>';
        return AGP.playerCard.renderHtml(p, { showFrame: false });
    }

    // ⚠️ [0.46.0] "بطاقة اختيار" — تُعاد استخدام ringAvatarHtml() نفسها
    // المستخدَمة ببطاقات شاشة الفائز (دائرة أفاتار + fallback أحرف أولى).
    // ⚠️ [0.45.7] isEliminate=true يضيف زرّي "إقصاء صاحب الدور"/"استئناف
    // اللعب" (تحكّم يدوي جديد بطلب صريح، مصدره تصميم مرجعي زوَّدنا به
    // المستخدم) — تحديداً بنافذة الإقصاء فقط، ما ينطبق على نافذة الإرجاع
    // (الإقصاء اليدوي مايعني شي بسياق الإرجاع، والإرجاع أصلاً عنده تخطي
    // عبر كتابة "تخطي" بالشات — بلا تغيير هناك).
    function chooserCardHtml(chooser, roleClass, isEliminate) {
        var actionsHtml = isEliminate ?
            '<div class="er-chooser-actions">' +
            '<button type="button" class="er-chooser-action-btn er-chooser-action-eliminate" id="er-chooser-eliminate-btn">❌ إقصاء صاحب الدور</button>' +
            '<button type="button" class="er-chooser-action-btn er-chooser-action-resume" id="er-chooser-resume-btn">▶️ استئناف اللعب</button>' +
            '</div>' : '';
        return '<div class="er-chooser-card-ring ' + roleClass + '">' +
            '<div class="er-chooser-card-inner">' + ringAvatarHtml(chooser) + '</div>' +
            '</div>' +
            '<div class="er-chooser-card-name">' + escapeHtml(playerLabel(chooser)) + '</div>' +
            actionsHtml;
    }

    function hideChooserCard() {
        var card = el('er-modal-chooser-card');
        if (card) { card.style.display = 'none'; card.innerHTML = ''; }
    }

    var _turnTickUnsub = null;
    var _turnEndUnsub = null;
    var _warningPlayedForSecond = null;

    function closeTurnModal() {
        var overlay = el('er-modal-overlay');
        if (overlay) overlay.style.display = 'none';
        hideChooserCard();
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
        var t = el('er-modal-timer');
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
     */
    function showResultAnnouncement(type, data, onDone) {
        ensureScaffolding();
        var overlay = el('er-modal-overlay');
        var box = el('er-modal-box');
        if (!overlay || !box) { if (typeof onDone === 'function') onDone(); return; }
        hideChooserCard();

        var isEliminate = type === 'eliminate';
        playSound(isEliminate ? 'eliminate' : 'revive');

        var verb = isEliminate ? 'قام بإقصاء' : 'قام بإرجاع';
        var chooserHtml = data.chooser ? announcePersonHtml(data.chooser, '') : '';
        var targetEffectClass = isEliminate
            ? 'er-announce-effect-red er-announce-target-fadeout'
            : 'er-announce-effect-green er-announce-target-revive-ring';
        var targetHtml = announcePersonHtml(data.target, targetEffectClass);

        box.className = 'er-announce-box ' + (isEliminate ? 'er-announce-eliminate' : 'er-announce-revive');
        box.innerHTML =
            '<div class="er-announce-sentence">' +
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
        return '<span class="er-announce-person">' +
            '<span class="er-announce-avatar-wrap ' + effectClass + '">' + ringAvatarHtml(player) + '</span>' +
            '<span class="er-announce-person-name">' + escapeHtml(playerLabel(player)) + '</span>' +
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
        showGiftReviveCard(entry.player);
        // ⚠️ لا نضيفه لقائمة نافذة إقصاء مفتوحة حالياً لو موجودة — يظهر
        // فقط بداية الدورة الجاية على العجلة (موجود أصلاً بـ_alive الآن).
    }

    /**
     * ⚠️ [0.46.0] "إنعاش بالدعم" (هدية) قد يحدث بأي لحظة — حتى وسط نافذة
     * دور مفتوحة — فلا يجوز استخدام تبويب #er-modal-box نفسه (يقاطع
     * الدور الجاري). بطاقة عائمة منفصلة بنفس فكرة/حجم toast لكن بمحتوى
     * مخصَّص (أفاتار المُنعَش + توهّج أخضر)، تختفي تلقائياً — قرار تصميم
     * بتفويض صريح من المستخدم بهذي النقطة ("محتواه حسب الحاجة وموقعه
     * نفذ بالطريقة الي تشوفها انسب").
     */
    function showGiftReviveCard(player) {
        var wrap = el('er-toast-wrap');
        if (!wrap) return;
        var card = document.createElement('div');
        card.className = 'er-gift-revive-card';
        card.innerHTML =
            '<span class="er-announce-avatar-wrap er-announce-effect-green">' + ringAvatarHtml(player) + '</span>' +
            '<span class="er-gift-revive-text">🎁 ' + escapeHtml(playerLabel(player)) + ' رجع للعبة عن طريق الدعم!</span>';
        wrap.appendChild(card);
        window.setTimeout(function () {
            if (card.parentNode) card.parentNode.removeChild(card);
        }, 4200);
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
    function pointsHtmlFor(pointsResult, player) {
        if (!pointsResult) {
            return '<div class="er-trophy-points er-points-noaccount">تعذّر جلب النقاط الآن</div>';
        }
        var awarded = findAwardedFor(pointsResult, player);
        if (awarded) {
            return '<div class="er-trophy-points er-points-earned">+' + awarded.added + ' نقطة' +
                '<span class="er-points-sub">تظهر في بروفايلك</span></div>';
        }
        return '<div class="er-trophy-points er-points-noaccount">لازم يسوي حساب عشان تظهر نقاطك بالبروفايل</div>';
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

    function ringHtml(player, kind) {
        var badgeIcon = kind === 'winner' ? '👑' : '⚔️';
        return '<div class="er-ring-wrap er-ring-' + kind + '">' +
            '<div class="er-ring-inner">' + ringAvatarHtml(player) + '</div>' +
            '<div class="er-ring-badge er-badge-' + kind + '">' + badgeIcon + '</div>' +
            '</div>';
    }

    function trophyCardHtml(player, opts) {
        opts = opts || {};
        return '<div class="er-trophy-card ' + (opts.cls || '') + '"' + (opts.cardId ? ' id="' + opts.cardId + '"' : '') + '>' +
            '<div class="er-trophy-label">' + opts.label + '</div>' +
            ringHtml(player, opts.kind) +
            '<div class="er-trophy-name">' + escapeHtml(playerLabel(player)) + '</div>' +
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

        var cardsHtml = '';
        if (winner) {
            cardsHtml += trophyCardHtml(winner, {
                cls: 'er-trophy-winner', label: '🏆 الفائز', kind: 'winner', cardId: 'er-trophy-card-winner',
                pointsHtml: pointsHtmlFor(pointsResult, winner)
            });
        }
        if (mostElim) {
            cardsHtml += trophyCardHtml(mostElim.player, {
                cls: 'er-trophy-most', label: '⚔️ الأكثر إقصاءً', kind: 'most', cardId: 'er-trophy-card-most',
                extra: '<div class="er-trophy-count">' + mostElim.count + ' إقصاء</div>',
                pointsHtml: pointsHtmlFor(pointsResult, mostElim.player)
            });
        }

        box.className = 'er-modal-box';
        box.style.textAlign = 'center';
        box.innerHTML =
            '<div id="er-winner-box">' +
            '<h2>🏁 انتهت المباراة!</h2>' +
            '<div class="er-trophy-cards">' + (cardsHtml || '<p class="er-trophy-label">بدون فائز</p>') + '</div>' +
            '<div class="er-winner-actions">' +
            '<button class="er-btn-secondary" id="er-replay-same-btn">🔄 إعادة المباراة بنفس اللاعبين</button>' +
            '<button class="er-btn-secondary" id="er-new-match-btn">🆕 بدء مباراة جديدة</button>' +
            '</div></div>';

        document.getElementById('er-replay-same-btn').onclick = handleReplaySamePlayers;
        document.getElementById('er-new-match-btn').onclick = function () {
            AGP.gameManager.resetSession(); // يبث game:reset — يستدعي onDestroy() تلقائياً
            window.location.reload();
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

    // ⚠️ زر "رجوع للمنصة" بشاشة الإعدادات الأولى (قبل الاتصال بالبث) —
    // طلب صريح (صورة 1)، بالإضافة لأيقونة 🏠 الثابتة بالهيدر أصلاً.
    function enhanceSettingsScreen() {
        var box = el('agp-shell-box');
        if (!box) return;
        if (box.classList.contains('agp-lobby-box') || box.classList.contains('agp-connecting-box')) return;
        if (box.querySelector('.er-back-to-platform-btn')) return;
        var connectBtn = box.querySelector('.agp-shell-btn-connect');
        if (!connectBtn) return;
        connectBtn.insertAdjacentElement('afterend', makeBackToPlatformBtn());
    }

    /**
     * ⚠️ علامة ✕ لإقصاء لاعب يدوياً من شاشة اللوبي (قبل بدء المباراة) —
     * طلب صريح (صورة 2)، وهي نفس ميزة "النقطة 7" المؤجَّلة سابقاً. تنبيه
     * صادق عن حدود الطريقة: renderLobbyPlayerList (بالملف المشترك) ما
     * يحط أي data-player-id على عناصر <li> باللوبي (بعكس قائمة منتصف
     * المباراة اللي تستخدم opts.removable الجاهزة أصلاً). فبدل تعديل
     * الملف المشترك، نطابق كل <li> بترتيبه (index) مع نفس ترتيب
     * AGP.gameManager.getPlayers() — نفس المصدر ونفس الدالة اللي
     * renderLobbyPlayerList تستخدمها لبناء القائمة أصلاً، فالترتيب يطابق
     * عملياً بكل الحالات الطبيعية (index-based وليس id-based، بنفس
     * الإقرار الصادق الموجود بتعليق روليت الفواكه الأصلي).
     */
    function enhanceLobbyList() {
        var list = el('agp-lobby-list');
        if (!list || !AGP.gameManager) return;
        var players = AGP.gameManager.getPlayers();
        var items = list.querySelectorAll('li');
        items.forEach(function (li, i) {
            if (li.querySelector('.er-lobby-remove-btn')) return;
            var player = players[i];
            if (!player || !player.id) return;
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'er-lobby-remove-btn';
            btn.title = 'إقصاء اللاعب قبل بدء المباراة';
            btn.textContent = '✕';
            btn.addEventListener('click', function (ev) {
                ev.stopPropagation();
                if (AGP.player && typeof AGP.player.removePlayer === 'function') {
                    AGP.player.removePlayer(player.id);
                }
            });
            li.appendChild(btn);
        });
    }

    /**
     * ⚠️ [0.45.18] تصغير تلقائي لحجم بطاقات اللوبي لو عدد اللاعبين كبير
     * (أكثر من ~15 — أكثر من 5 صفوف بشبكة 3 أعمدة) — طلب صريح بعد ما
     * جُرِّب 18 لاعباً وطلع قصّ بصري حقيقي بالصف السادس مع الحجم الكامل
     * الثابت (900px صندوق ثابت، طلب مؤكَّد سابقاً). بدل الاعتماد على
     * سكرول داخلي، نقيس المساحة الرأسية المتاحة فعلياً لقائمة اللاعبين
     * (list.clientHeight — القيمة اللي يفرضها تخطيط flex-column الثابت
     * بالفعل، بعد ما "تقتص" حصة القائمة من الصندوق الثابت 900px) ونحسب
     * أصغر نسبة تكبير (scale) تخلي كل الصفوف تنضم بدون قصّ، ثم نحقن
     * القيم الجديدة كمتغيّرات CSS (custom properties) على الصندوق —
     * القواعد بـinjectStageStyles() تستخدم var(--er-lobby-*, <حجم كامل
     * افتراضي>) فتتحدَّث تلقائياً. يُعاد الحساب مع كل تغيّر بعدد
     * اللاعبين (نفس MutationObserver الموجود، عبر applyShellEnhancements).
     */
    /**
     * ⚠️ [0.45.19] بدل تبديل كامل الشبكة لعمودين (محاولة أولى رُفضت
     * صراحةً من المستخدم: "لا غلط خل ثلاثه اسماء بس لو حصل فيه اسم
     * طويل يصبح اسمين بجانب بعض") — الشبكة تبقى 3 أعمدة دائماً، وفقط
     * البطاقة صاحبة الاسم الطويل (اللي عرضها الطبيعي أكبر من عرض عمود
     * واحد متاح فعلياً) تاخذ عرض عمودين (`grid-column:span 2`، عبر
     * كلاس `.er-lobby-card-wide`)، فيصير بصف تلك البطاقة مكان لبطاقة
     * واحدة إضافية بجانبها بس (بدل 2). بقية الصفوف اللي كل أسمائها
     * قصيرة تبقى 3 بطاقات بالضبط بدون أي تغيير. نقرأ القيم الحالية
     * المُطبَّقة فعلياً (أفاتار/بلاطة بعد أي تصغير سابق) بدل أرقام أساس
     * ثابتة، حتى يتطابق القرار مع الحجم الفعلي المعروض حالياً.
     */
    function markWideLobbyCards(box, list) {
        var items = list.querySelectorAll('li');
        if (items.length === 0) return 0;

        var availableWidth = list.clientWidth || box.clientWidth || 1400;
        var GRID_GAP = 10, BUFFER = 8, COLUMNS = 3;
        var columnWidth = (availableWidth - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

        var avatarRef = parseFloat(box.style.getPropertyValue('--er-lobby-avatar-size')) || 65;
        var pillMinRef = parseFloat(box.style.getPropertyValue('--er-lobby-pill-minw')) || 260;
        var pillMaxRef = parseFloat(box.style.getPropertyValue('--er-lobby-pill-maxw')) || 450;

        var totalSlots = 0;
        for (var i = 0; i < items.length; i++) {
            var li = items[i];
            var wide = false;
            var nameEl = li.querySelector('.agp-pcard-name-basic');
            if (nameEl) {
                var textW = nameEl.scrollWidth;
                if (textW > pillMaxRef) textW = pillMaxRef; // بعد هذا الحد ellipsis يتكفّل بالقصّ بغضّ النظر عن مساحة العمود
                var cardW = avatarRef + Math.max(pillMinRef, textW);
                wide = (cardW + BUFFER) > columnWidth;
            } else {
                var tpl = li.querySelector('.agp-pcard-tpl'); // بطاقة مؤطَّرة — عرضها مبني على صورة الإطار نفسها
                if (tpl) {
                    var tplW = tpl.getBoundingClientRect().width || 0;
                    wide = (tplW + BUFFER) > columnWidth;
                }
            }
            li.classList.toggle('er-lobby-card-wide', wide);
            totalSlots += wide ? 2 : 1;
        }
        return totalSlots;
    }

    function applyDynamicLobbyCardScale() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        var list = el('agp-lobby-list');
        if (!list) return;
        var n = list.querySelectorAll('li').length;
        if (n === 0) return;

        // ⚠️ [0.45.19] البطاقات العريضة (اسم طويل) تاخذ مكان بطاقتين —
        // totalSlots يحسب "عدد المواقع الفعلي" المطلوب (بطاقة عادية=1،
        // عريضة=2) عشان تقدير عدد الصفوف يبقى دقيقاً لحساب التصغير
        // الرأسي أدناه، بدل الاعتماد على عدد اللاعبين الخام فقط.
        var totalSlots = markWideLobbyCards(box, list);

        // ⚠️ أرقام الأساس (الحجم الكامل عند 100% — نفس القيم الافتراضية
        // بقواعد CSS): صف كامل ≈ 88px (أفاتار 65px+حدود + حشو li)،
        // فجوة 10px بين الصفوف.
        // ⚠️ [0.45.20] طلب صريح: تصغير إضافي للحجم الكامل الأساسي (~13%)
        // بعد موافقة المستخدم على تخطيط [0.45.19] — أفاتار 75→65،
        // بلاطة 60→52، خط 35→30، عرض البلاطة 300-520→260-450، صف
        // 100→88، تكبير الإطار 1.15→1.00 (نفس نسبة التخفيض تقريباً على
        // الكل حتى تبقى النسب متوازنة بين البطاقات المؤطَّرة والأساسية).
        var BASE_ROW = 88, BASE_GAP = 10, BASE_AVATAR = 65, BASE_PILL_H = 52,
            BASE_FONT = 30, BASE_PILL_MINW = 260, BASE_PILL_MAXW = 450, BASE_ZOOM = 1.00;
        var MIN_SCALE = 0.55; // حد أدنى — تحته الخط/الأفاتار يصير غير مقروء بالبث

        var rows = Math.ceil(totalSlots / 3);
        var available = list.clientHeight || 620;
        var neededFull = rows * BASE_ROW + Math.max(0, rows - 1) * BASE_GAP;

        var scale = 1;
        if (neededFull > available && rows > 0) {
            scale = available / neededFull;
            if (scale < MIN_SCALE) scale = MIN_SCALE;
        }

        box.style.setProperty('--er-lobby-avatar-size', Math.round(BASE_AVATAR * scale) + 'px');
        box.style.setProperty('--er-lobby-pill-height', Math.round(BASE_PILL_H * scale) + 'px');
        box.style.setProperty('--er-lobby-font-size', Math.max(14, Math.round(BASE_FONT * scale)) + 'px');
        box.style.setProperty('--er-lobby-pill-minw', Math.round(BASE_PILL_MINW * scale) + 'px');
        box.style.setProperty('--er-lobby-pill-maxw', Math.round(BASE_PILL_MAXW * scale) + 'px');
        box.style.setProperty('--er-lobby-grid-gap', Math.max(4, Math.round(BASE_GAP * scale)) + 'px');
        box.style.setProperty('--er-lobby-row-min-height', Math.round(BASE_ROW * scale) + 'px');
        box.style.setProperty('--er-lobby-frame-zoom', (BASE_ZOOM * scale).toFixed(3));
    }

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

    function applyShellEnhancements() {
        enhanceSettingsScreen();
        enhanceLobbyList();
        applyDynamicLobbyCardScale();
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
            settingsTitle: 'إعدادات مباراة روليت الإقصاء',
            gameExplanation: 'تدور العجلة وتتوقف عند أحد اللاعبين، فيختار رقم لاعب آخر ليقصيه من الشات. ' +
                'لو وقفت العجلة على نفس الشخص مرتين متتاليتين (ولو مفعّلة ميزة انعاش صديق)، يقدر يرجّع مُقصى بدل الإقصاء ' +
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
