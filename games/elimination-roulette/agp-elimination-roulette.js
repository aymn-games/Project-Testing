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
    var WHEEL_PALETTE = [C_ACCENT, C_PINK, C_ACCENT2, C_ACCENT_LT, C_PINK_LT, C_ACCENT2_LT];

    var COMMON_GIFTS = [
        { label: '🌹 وردة', value: 'Rose' },
        { label: '💖 تيك توك', value: 'TikTok' },
        { label: '🤍 قلب الإصبع', value: 'Finger Heart' },
        { label: '🎤 جي جي', value: 'GG' },
        { label: '🍦 مخروط آيسكريم', value: 'Ice Cream Cone' },
        { label: '🧴 عطر', value: 'Perfume' },
        { label: '🍩 دوناتس', value: 'Doughnut' },
        { label: '💞 قلوب اليد', value: 'Hand Hearts' },
        { label: '🕶️ نظارة شمسية', value: 'Sunglasses' },
        { label: '👑 تاج صغير', value: 'Little Crown' },
        { label: '🐕 كلب كورجي', value: 'Corgi' },
        { label: '💐 باقة ورد', value: 'Rosa' },
        { label: '🎵 نغمة موسيقية', value: 'Music Note' },
        { label: '🎉 قصاصات احتفالية', value: 'Confetti Battle' },
        { label: '🌌 مجرة', value: 'Galaxy' },
        { label: '💸 مسدس نقود', value: 'Money Gun' },
        { label: '🏎️ سيارة رياضية', value: 'Sports Car' },
        { label: '🦁 أسد', value: 'Lion' },
        { label: '💃 ملكة الدراما', value: 'Drama Queen' },
        { label: '🌠 كون تيك توك', value: 'TikTok Universe' }
    ];

    var ELIMINATION_TIMER_OPTIONS = [20, 25, 30, 40].map(function (s) {
        return { label: s + 'ث', value: s };
    });

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

            /* ---- شريط أسماء اللاعبين أعلى العجلة ---- */
            '#er-names-strip{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:820px;',
            'padding:4px 12px;margin-top:6px;}',
            '.er-name-pill{background:rgba(255,255,255,0.1);border:1px solid rgba(124,58,237,0.45);',
            'border-radius:999px;padding:5px 14px;font-size:0.85em;font-weight:700;color:#f3eefc;}',

            /* ---- العجلة الحقيقية (Conic Gradient + حلقة مصابيح) ---- */
            '#er-wheel-wrap{position:relative;width:min(440px,88vw);height:min(440px,88vw);margin-top:8px;}',
            '#er-wheel-bezel{position:absolute;inset:-14px;border-radius:50%;',
            'background:linear-gradient(135deg,var(--er-accent2),var(--er-accent),var(--er-pink));',
            'box-shadow:0 0 46px rgba(124,58,237,0.65),inset 0 0 0 6px rgba(255,255,255,0.15);}',
            '.er-bulb{position:absolute;width:9px;height:9px;border-radius:50%;background:#fff8dd;',
            'box-shadow:0 0 8px 2px rgba(255,244,180,0.85);}',
            '#er-wheel{position:absolute;inset:8px;border-radius:50%;border:5px solid rgba(255,255,255,0.92);',
            'transition:transform 3.2s cubic-bezier(0.15,0.85,0.25,1);box-shadow:inset 0 0 30px rgba(0,0,0,0.35);overflow:hidden;}',
            '#er-wheel-pointer{position:absolute;top:-20px;left:50%;transform:translateX(-50%);',
            'width:0;height:0;border-left:16px solid transparent;border-right:16px solid transparent;',
            'border-top:26px solid #fff4b8;z-index:6;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));}',

            /* ---- محور المنتصف = زر الدوران (شعار + كلمة "دور") ---- */
            '#er-spin-hub{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:7;',
            'width:104px;height:104px;border-radius:50%;border:4px solid #fff;cursor:pointer;',
            'background:radial-gradient(circle at 35% 30%,#2a1443,#0e0e16);',
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;',
            'box-shadow:0 0 24px rgba(0,194,255,0.6),0 4px 10px rgba(0,0,0,0.5);padding:0;}',
            '#er-spin-hub img{width:44px;height:44px;object-fit:contain;border-radius:50%;}',
            '#er-spin-hub span{font-size:0.82em;font-weight:900;color:#fff;font-family:Almarai,Cairo,sans-serif;}',
            '#er-spin-hub:disabled{opacity:0.55;cursor:not-allowed;}',
            '#er-spin-hub:not(:disabled):hover{box-shadow:0 0 34px rgba(0,194,255,0.85),0 4px 14px rgba(0,0,0,0.5);}',

            /* ---- نافذة الدور (إقصاء/إرجاع) — 1200×800 ---- */
            '#er-modal-overlay{position:fixed;inset:0;z-index:100010;display:none;align-items:center;',
            'justify-content:center;padding:16px;background:rgba(8,4,16,0.72);}',
            // ⚠️ [0.44.0] تعديل: height ثابتة 800px كانت تترك فراغاً فارغاً
            // كبيراً أسفل المحتوى بالتبويبات الأقصر (منبثقة اختيار الهدية،
            // إعلان النتيجة، شاشة الفائز) — نفس الملاحظة اللي طلعت
            // بالاختبار البصري لصندوق شاشة الإعدادات المشتركة. حوّلتها
            // لـheight:auto مع max-height:800px (سقف أقصى فقط).
            '#er-modal-box{width:1200px;max-width:97vw;height:auto;max-height:800px;max-height:min(800px,94vh);overflow-y:auto;box-sizing:border-box;',
            'background:linear-gradient(180deg,#efe0fb,#e2c7f7);border:2px solid var(--er-accent);border-radius:20px;',
            'padding:28px 32px;color:#2c1240;box-shadow:0 0 50px rgba(124,58,237,0.55);}',
            '#er-modal-box h2{margin:0 0 6px;font-size:1.5em;text-align:center;color:#3a1560;font-weight:800;',
            'font-family:Almarai,Cairo,sans-serif;}',
            /* اسم صاحب الدور — بارز، سطر مستقل، لون مميز */
            '#er-modal-chooser{text-align:center;font-size:1.5em;font-weight:900;margin:2px 0 4px;}',
            '#er-modal-chooser.er-role-eliminate{color:var(--er-accent);}',
            '#er-modal-chooser.er-role-revive{color:var(--er-accent2);}',
            '#er-modal-sub{text-align:center;color:#5a2585;font-size:0.95em;margin-bottom:10px;}',
            '#er-modal-timer{text-align:center;font-weight:900;font-size:2.2em;color:var(--er-accent);margin-bottom:16px;',
            'transition:color 0.2s;}',
            '#er-modal-timer.er-timer-warning{color:#e0193f;animation:er-pulse 1s infinite;}',
            '@keyframes er-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.08);}}',

            /* بطاقات مرشَّحين جنباً لجنب — بدون خلفية مستطيل خلف الصف */
            '#er-candidates-grid{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;}',
            '.er-candidate-card{display:flex;align-items:center;gap:6px;cursor:pointer;',
            'padding:4px;border-radius:14px;transition:background 0.15s;}',
            '.er-candidate-card:hover{background:rgba(124,58,237,0.12);}',
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
            '.er-announce-box{text-align:center;padding:20px;}',
            '.er-announce-box .er-announce-icon{font-size:3em;margin-bottom:8px;}',
            '.er-announce-box .er-announce-title{font-size:1.3em;font-weight:900;margin-bottom:14px;}',
            '.er-announce-box.er-announce-eliminate .er-announce-title{color:#c81452;}',
            '.er-announce-box.er-announce-revive .er-announce-title{color:#128a4e;}',
            '.er-announce-box .er-announce-name{font-size:1.8em;font-weight:900;margin:6px 0;}',
            '.er-announce-box.er-announce-eliminate .er-announce-name{color:#c81452;}',
            '.er-announce-box.er-announce-revive .er-announce-name{color:#128a4e;}',
            '.er-announce-box .er-announce-by{color:#5a2585;font-size:0.95em;}',

            /* ---- Toasts ---- */
            '#er-toast-wrap{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100020;',
            'display:flex;flex-direction:column;gap:8px;align-items:center;}',
            '.er-toast{background:rgba(20,8,35,0.92);border:1px solid rgba(124,58,237,0.55);color:#f3eefc;',
            'padding:10px 18px;border-radius:999px;font-size:0.85em;font-weight:700;box-shadow:0 6px 16px rgba(0,0,0,0.35);}',

            /* ---- شاشة نهاية المباراة ---- */
            '#er-winner-box{text-align:center;}',
            '#er-winner-box h2{font-family:Almarai,Cairo,sans-serif;font-size:1.6em;}',
            '.er-trophy-cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin:14px 0 18px;}',
            '.er-trophy-card{flex:1;min-width:220px;border-radius:16px;padding:18px 14px;background:#fff;}',
            '.er-trophy-card.er-trophy-winner{border:3px solid #ffcc4d;box-shadow:0 0 22px rgba(255,204,77,0.5);}',
            '.er-trophy-card.er-trophy-most{border:3px solid var(--er-pink);box-shadow:0 0 22px rgba(255,77,255,0.35);}',
            '.er-trophy-card .er-trophy-label{font-size:0.85em;font-weight:800;color:#5a2585;margin-bottom:8px;}',
            '.er-trophy-card .er-trophy-avatar-wrap{display:flex;justify-content:center;margin-bottom:8px;}',
            '.er-trophy-card .er-trophy-avatar-wrap img,.er-trophy-card .er-trophy-avatar-wrap .agp-pcard-avatar-basic{width:64px;height:64px;}',
            '.er-trophy-name{font-size:1.15em;font-weight:900;color:#2c1240;}',
            '.er-trophy-count{color:#5a2585;font-size:0.85em;margin-top:4px;}',
            '.er-winner-actions{display:flex;gap:10px;flex-wrap:wrap;}',
            '.er-btn-secondary{flex:1;min-width:180px;padding:12px;border-radius:999px;border:none;',
            'font-weight:800;cursor:pointer;font-family:inherit;font-size:0.95em;}',
            '#er-replay-same-btn{background:linear-gradient(90deg,var(--er-accent2),var(--er-accent));color:#0b0616;}',
            '#er-new-match-btn{background:#fff;border:1px solid var(--er-accent);color:#5a2585;}'
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
            overlay.innerHTML = '<div id="er-modal-box"></div>';
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
        var stage = el('er-stage');
        if (!stage) {
            stage = document.createElement('div');
            stage.id = 'er-stage';
            document.body.appendChild(stage);
        }
        stage.innerHTML =
            '<div id="er-names-strip"></div>' +
            '<div id="er-wheel-wrap">' +
            '<div id="er-wheel-bezel"></div>' +
            '<div id="er-wheel-pointer"></div>' +
            '<div id="er-wheel"></div>' +
            '<button id="er-spin-hub" title="دوّر العجلة"><img src="../../logo.png" alt="ألعاب أيمن"><span>دور</span></button>' +
            '</div>';

        renderWheelBulbs();
        renderWheelSlices();
        renderNamesStrip();
        el('er-spin-hub').onclick = handleSpinClick;
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

    function renderNamesStrip() {
        var strip = el('er-names-strip');
        if (!strip) return;
        strip.innerHTML = _alive.map(function (p) {
            return '<span class="er-name-pill">' + escapeHtml(playerLabel(p)) + '</span>';
        }).join('');
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
        }
        // 'skip_turn' — لا شيء، فقط تُغلق النافذة وتكمل المباراة بدون إقصاء
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
        renderNamesStrip();
        closeTurnModal();

        showResultAnnouncement('eliminate', {
            targetName: playerLabel(target),
            byName: eliminatorId ? playerLabel(findPlayerByIdAnywhere(eliminatorId)) : null
        }, function onDone() {
            if (_alive.length <= 1) {
                endMatch(_alive[0] || null);
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
        });
    }

    function revivePlayer(target) {
        var idx = _eliminated.findIndex(function (e) { return e.player.id === target.id; });
        if (idx === -1) return;
        _eliminated.splice(idx, 1);
        _alive.push(target);
        _friendRevivedIds[target.id] = true; // ⚠️ يُستخدَم فقط لإرجاع "انعاش صديق" — مرة واحدة طول العمر

        renderWheelSlices();
        renderNamesStrip();
        closeTurnModal();

        showResultAnnouncement('revive', { targetName: playerLabel(target) });
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
            '<div id="er-modal-chooser" class="' + roleClass + '">' + escapeHtml(playerLabel(_pendingTurn.chooser)) + ' يختار!</div>' +
            '<div id="er-modal-sub">' + subtitle + '</div>' +
            '<div id="er-modal-timer"></div>' +
            '<div id="er-candidates-grid">' + rows + '</div>';

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

    var _turnTickUnsub = null;
    var _turnEndUnsub = null;
    var _warningPlayedForSecond = null;

    function closeTurnModal() {
        var overlay = el('er-modal-overlay');
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
            revivePlayer(target);
        }
    }

    /* ======================================================================
     *  7ب) تبويب إعلان النتيجة (إقصاء/إرجاع) — 4 ثوانٍ + صوت
     * ==================================================================== */
    function showResultAnnouncement(type, data, onDone) {
        ensureScaffolding();
        var overlay = el('er-modal-overlay');
        var box = el('er-modal-box');
        if (!overlay || !box) { if (typeof onDone === 'function') onDone(); return; }

        var isEliminate = type === 'eliminate';
        playSound(isEliminate ? 'eliminate' : 'revive');

        box.className = 'er-announce-box ' + (isEliminate ? 'er-announce-eliminate' : 'er-announce-revive');
        var byLine = (isEliminate && data.byName) ? '<div class="er-announce-by">بواسطة ' + escapeHtml(data.byName) + '</div>' : '';
        box.innerHTML =
            '<div class="er-announce-icon">' + (isEliminate ? '❌' : '💚') + '</div>' +
            '<div class="er-announce-title">' + (isEliminate ? 'تم الإقصاء' : 'رجع للعبة!') + '</div>' +
            '<div class="er-announce-name">' + escapeHtml(data.targetName) + '</div>' +
            byLine;

        overlay.style.display = 'flex';

        window.setTimeout(function () {
            overlay.style.display = 'none';
            box.className = '';
            if (typeof onDone === 'function') onDone();
        }, 4000);
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
        renderNamesStrip();

        showToast('🎁 ' + playerLabel(entry.player) + ' رجع للعبة عن طريق الدعم! يدخل العجلة بداية الجولة الجاية');
        // ⚠️ لا نضيفه لقائمة نافذة إقصاء مفتوحة حالياً لو موجودة — يظهر
        // فقط بداية الدورة الجاية على العجلة (موجود أصلاً بـ_alive الآن).
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
        renderNamesStrip();

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
     *      — بدون أي تعديل، النظام العام الموحّد فقط)
     * ==================================================================== */
    function endMatch(winner) {
        _matchActive = false;
        closeTurnModal();
        if (typeof _commentUnsub === 'function') _commentUnsub();
        if (typeof _giftUnsub === 'function') _giftUnsub();

        var durationMs = _startedAt ? (Date.now() - _startedAt) : 0;

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var allPlayers = AGP.gameManager.getPlayers();
            var participants = allPlayers.map(function (p) {
                return {
                    tiktokUsername: p.name || p.id,
                    won: Boolean(winner) && p.id === winner.id
                };
            }).filter(function (p) { return p.tiktokUsername; });

            if (participants.length) {
                window.AGPAuth.reportRoundCompletion(participants, durationMs).catch(function () {
                    // فشل صامت — لا نوقف عرض نتيجة المباراة بسبب هذا (نفس نمط dashboard-core.js).
                });
            }
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });
        renderWinnerScreen(winner);
    }

    function trophyCardHtml(player, opts) {
        opts = opts || {};
        var avatarHtml = AGP.playerCard ? AGP.playerCard.renderHtml(player, { showFrame: false }) :
            '<span>' + escapeHtml(playerLabel(player)) + '</span>';
        return '<div class="er-trophy-card ' + (opts.cls || '') + '">' +
            '<div class="er-trophy-label">' + opts.label + '</div>' +
            '<div class="er-trophy-avatar-wrap">' + avatarHtml + '</div>' +
            (opts.extra || '') +
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

    function renderWinnerScreen(winner) {
        ensureScaffolding();
        var overlay = el('er-modal-overlay');
        var box = el('er-modal-box');
        if (!overlay || !box) return;

        var mostElim = computeMostEliminations();

        var cardsHtml = '';
        if (winner) {
            cardsHtml += trophyCardHtml(winner, { cls: 'er-trophy-winner', label: '🏆 الفائز' });
        }
        if (mostElim) {
            cardsHtml += trophyCardHtml(mostElim.player, {
                cls: 'er-trophy-most', label: '⚔️ الأكثر إقصاءً',
                extra: '<div class="er-trophy-count">' + mostElim.count + ' إقصاء</div>'
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

        if (AGP.playerCard) AGP.playerCard.fitAllNames(box);

        document.getElementById('er-replay-same-btn').onclick = handleReplaySamePlayers;
        document.getElementById('er-new-match-btn').onclick = function () {
            AGP.gameManager.resetSession(); // يبث game:reset — يستدعي onDestroy() تلقائياً
            window.location.reload();
        };

        overlay.style.display = 'flex';
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
        return match ? match.label : (value || 'اختر هدية');
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

        var itemsHtml = COMMON_GIFTS.map(function (g) {
            var active = g.value === currentValue ? 'agp-pill-active' : '';
            return '<button type="button" class="agp-pill-btn ' + active + '" data-gift-value="' + escapeHtml(g.value) + '" ' +
                'style="margin:4px;font-size:0.95em;">' + g.label + '</button>';
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
                key: 'soundVolume', type: 'counter', label: '🔊 مستوى الصوت',
                min: 0, default: 7
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
            onStartRound: handleStartRound
        });
    }

    AGP.events.on('platform:ready', function () {
        registerGame();
    });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
