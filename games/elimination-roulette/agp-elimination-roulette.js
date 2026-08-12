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

    function injectStageStyles() {
        if (el('er-stage-styles')) return;
        var style = document.createElement('style');
        style.id = 'er-stage-styles';
        style.textContent = [
            ':root{--er-accent:' + C_ACCENT + ';--er-accent2:' + C_ACCENT2 + ';--er-pink:' + C_PINK + ';}',

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
            '#er-wheel-wrap{position:relative;width:min(440px,88vw);height:min(440px,88vw);margin-top:46px;}',
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
            '#er-modal-box{width:1300px;max-width:97vw;height:auto;max-height:800px;max-height:min(800px,94vh);overflow-y:auto;box-sizing:border-box;',
            'background:linear-gradient(180deg,#884B98,#2D1932);border:2px solid var(--er-accent);border-radius:20px;',
            'padding:28px 32px;color:#fff;box-shadow:0 0 50px rgba(124,58,237,0.55);}',
            '#er-modal-box h2{margin:0 0 6px;font-size:1.5em;text-align:center;color:#fff;font-weight:800;',
            'font-family:Almarai,Cairo,sans-serif;}',
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
            '#er-modal-sub{text-align:center;color:#e9d3ff;font-size:0.95em;margin-bottom:10px;}',
            '#er-modal-timer{text-align:center;font-weight:900;font-size:2.2em;color:#ffe066;margin-bottom:16px;',
            'transition:color 0.2s;}',
            '#er-modal-timer.er-timer-warning{color:#ff4d6d;animation:er-pulse 1s infinite;}',
            '@keyframes er-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.08);}}',

            /* بطاقات مرشَّحين جنباً لجنب — بدون خلفية مستطيل خلف الصف */
            '#er-candidates-grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;}',
            '.er-candidate-card{display:flex;align-items:center;gap:6px;cursor:pointer;',
            'padding:4px;border-radius:14px;transition:background 0.15s;}',
            '.er-candidate-card:hover{background:rgba(255,255,255,0.12);}',
            '.er-candidate-num{color:#fff;border-radius:50%;width:28px;height:28px;',
            'display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.85em;flex-shrink:0;}',
            '.er-candidate-num.er-role-eliminate{background:var(--er-accent);}',
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
             * ⚠️ [0.47.0] العرض صار 250px بدل 450px (طلب صريح). */
            '#er-event-log{position:fixed;left:0;top:70px;bottom:0;width:250px;max-width:90vw;',
            'box-sizing:border-box;padding:14px 16px;overflow-y:auto;background:rgba(12,6,22,0.55);',
            'border-inline-end:1px solid rgba(156,143,176,0.25);z-index:20;}',
            '#er-event-log h3{margin:0 0 10px;font-size:0.95em;font-weight:800;color:#e9d3ff;}',
            '.er-event-log-item{display:flex;align-items:flex-start;gap:8px;font-size:0.82em;color:#f3eefc;',
            'background:rgba(255,255,255,0.05);border-radius:10px;padding:6px 10px;margin-bottom:6px;line-height:1.5;}',
            '.er-event-icon{flex-shrink:0;}'
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
        renderWheelSlices();
        renderWheelLabels();
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
        _wheelRotation += targetAngle;

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

        renderWheelSlices();
        renderWheelLabels();
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
            maybeAutoSpin();
        });
    }

    function revivePlayer(target, chooserId) {
        var idx = _eliminated.findIndex(function (e) { return e.player.id === target.id; });
        if (idx === -1) return;
        _eliminated.splice(idx, 1);
        _alive.push(target);
        _friendRevivedIds[target.id] = true; // ⚠️ يُستخدَم فقط لإرجاع "انعاش صديق" — مرة واحدة طول العمر

        renderWheelSlices();
        renderWheelLabels();
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

        box.className = '';
        box.innerHTML =
            '<h2>' + title + '</h2>' +
            '<div id="er-modal-sub">' + subtitle + '</div>' +
            '<div id="er-modal-timer"></div>' +
            '<div id="er-candidates-grid">' + rows + '</div>';

        // ⚠️ [0.46.0] بطاقة الاختيار (أفاتار+اسم بحلقة ملوَّنة) تظهر فوق
        // الصندوق كعنصر شقيق منفصل بفاصل واضح (gap على #er-modal-overlay)
        // — بدل نص "الاسم يختار!" الملغى بالكامل.
        var chooserCard = el('er-modal-chooser-card');
        if (chooserCard) {
            chooserCard.innerHTML = chooserCardHtml(_pendingTurn.chooser, roleClass);
            chooserCard.style.display = 'flex';
        }

        if (AGP.playerCard) AGP.playerCard.fitAllNames(box);

        box.querySelectorAll('.er-candidate-card').forEach(function (row) {
            row.onclick = function () {
                var i = parseInt(row.getAttribute('data-index'), 10);
                resolveTurnSelection(i);
            };
        });

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
    function chooserCardHtml(chooser, roleClass) {
        return '<div class="er-chooser-card-ring ' + roleClass + '">' +
            '<div class="er-chooser-card-inner">' + ringAvatarHtml(chooser) + '</div>' +
            '</div>' +
            '<div class="er-chooser-card-name">' + escapeHtml(playerLabel(chooser)) + '</div>';
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

        window.setTimeout(function () {
            overlay.style.display = 'none';
            box.className = '';
            if (typeof onDone === 'function') onDone();
        }, 4000);
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

        renderWheelSlices();
        renderWheelLabels();

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

        renderWheelSlices();
        renderWheelLabels();

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

    /* ======================================================================
     *  10ب) بانر أحداث المباراة — شريط جانبي ثابت (450px)، من تحت الشعار
     *      حتى أسفل الشاشة، بنفس جهة الشعار (يسار — أعلى يسار بالهيدر
     *      الفعلي المرصود بالاختبار البصري). يسجّل 5 أنواع أحداث بشكل
     *      مستمر: دوران، إقصاء، إرجاع، انضمام لاعب جديد، هدايا.
     * ==================================================================== */
    var EVENT_ICONS = { spin: '🎡', eliminate: '❌', revive: '💚', join: '➕', gift: '🎁' };
    var EVENT_LOG_MAX = 60;

    function ensureEventLog() {
        if (el('er-event-log')) return;
        var log = document.createElement('div');
        log.id = 'er-event-log';
        log.innerHTML = '<h3>📋 أحداث المباراة</h3><div id="er-event-log-list"></div>';
        document.body.appendChild(log);
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
                key: 'friendRevivalEnabled', type: 'toggle', label: '🎗️ ميزة انعاش صديق',
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

    function registerGame() {
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
        AGP.events.on('player:joined', function (payload) {
            var p = payload && payload.player;
            if (p) logEvent('join', '➕ ' + playerLabel(p) + ' انضم للعبة');
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
    }

    AGP.events.on('platform:ready', function () {
        registerGame();
    });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
