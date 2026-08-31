/**
 * ==========================================================================
 *  AGP MUSICAL CHAIRS — "الكراسي الموسيقية" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 *
 * لعبة أصلية (Native) داخل نفس مستودع Project-Testing، بنفس نمط
 * games/elimination-roulette بالضبط: صفحتها الخاصة
 * (games/musical-chairs/index.html) تحمّل AGP Core كاملاً + js/agp-game-shell.js
 * (عام، غير مُعدَّل هنا) + هذا الملف. لا تعديل على أي ملف موجود بالمشروع —
 * ملف Plugin مستقل تماماً بنفس فلسفة روليت الإقصاء، بقرار صريح من صاحب
 * المشروع (منطق إقصاء خاص باللعبة، لا محرك مشترك).
 *
 * ⚠️ ملاحظة صادقة: مؤثرات الصوت القصيرة الخمسة (reveal/claim/eliminate/
 *   warning/winner) مُولَّدة برمجياً (نغمات بسيطة)، بديل عملي متاح فوراً.
 *   أما مقاطع الموسيقى الطويلة (شيلات/أغاني خليجية) فملفات حقيقية زوَّدنا
 *   بها صاحب المشروع مباشرة (sounds/shailat/1-5.mp3, sounds/khaleeji/1-5.mp3).
 *
 * ملخص الآلية (نسخة معدَّلة — تدوير يدوي بدل التلقائي بالكامل):
 *   - كل دورة: الحلقة تبدأ ثابتة، والاستريمر يضغط زر "تدوير" بنفسه.
 *   - مدة التدوير الطبيعية 12 ثانية (يتوقف تلقائياً بعدها)، أو يقدر
 *     الاستريمر يضغط الزر مرة ثانية أثناء الدوران لإيقافه مبكراً يدوياً.
 *   - وقت الدوران، يشتغل مقطع موسيقى واحد حسب النوع المحدد بزر "تحديد
 *     نوع الموسيقى" (عشوائي من الكل / شيلات فقط / أغاني خليجية فقط).
 *   - لحظة توقف الدوران: يتوقف الصوت فوراً + تظهر أرقام عشوائية (10–99)
 *     على الكراسي + تبدأ مهلة اختيار الكرسي (المدة المحددة بإعدادات
 *     المباراة) — تظهر كعدّاد حي بجانب زر التدوير مباشرة.
 *   - كل لاعب حي يكتب رقم كرسي بالشات؛ أول رقم صحيح يوصل لكرسي فاضي
 *     يثبَّت عليه فوراً (أي محاولة بعدها لنفس الكرسي أو من نفس اللاعب
 *     تُتجاهل تماماً).
 *   - عند انتهاء المهلة، أي لاعب حي بدون كرسي يُقصى بأنيميشن متتابع
 *     (لاعب تلو الآخر) + صوت إقصاء، ثم الاستريمر يضغط "تدوير" مرة ثانية
 *     بنفسه للدورة الجاية (ما تبدأ تلقائياً).
 *   - عدد الكراسي كل دورة: وضعان يحددهما الاستريمر بشاشة الإعدادات —
 *       "تلقائي": دائماً (عدد اللاعبين المتبقين − 1).
 *       "مخصّص": يبدأ بعجز يحدده الاستريمر (مثلاً 5)، وينقص واحد كل
 *       دورة (5 ثم 4 ثم 3...) لين يثبت عند 1.
 *   - يبقى لاعب واحد = الفائز، تظهر شاشة الفائز مع فيديو احتفال + البطاقة.
 *
 * الاعتماديات (بنفس ترتيب index.html القياسي، راجع docs/CLAUDE.md):
 *   js/agp-core.js … js/agp-bootstrap.js (AGP Core كامل)، ثم
 *   js/agp-player-card.js، ثم js/agp-game-shell.js، ثم هذا الملف.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    if (!AGP.gameManager || !AGP.gameShell || !AGP.timerManager) {
        console.error('[AGP Musical Chairs] AGP Core/Game Shell غير محمَّل بعد — تأكد من ترتيب تحميل الملفات بـindex.html.');
        return;
    }

    var GAME_ID = 'musical-chairs';
    var GAME_NAME = 'الكراسي الموسيقية';
    var TIMER_NAME = 'mc-selection-timer';

    var SELECTION_TIMER_OPTIONS = [
        { label: '10 ثوانٍ', value: 10 },
        { label: '15 ثانية', value: 15 },
        { label: '20 ثانية', value: 20 },
        { label: '30 ثانية', value: 30 }
    ];

    // ⚠️ مدة تدوير الموسيقى (قابلة للتحكم من الاستريمر) — أقصى شي 35
    // ثانية بالضبط (طلب صريح)
    var SPIN_DURATION_OPTIONS = [
        { label: '10 ثوانٍ', value: 10 },
        { label: '15 ثانية', value: 15 },
        { label: '20 ثانية', value: 20 },
        { label: '25 ثانية', value: 25 },
        { label: '30 ثانية', value: 30 },
        { label: '35 ثانية', value: 35 }
    ];

    // (SPIN_DURATION_MS الثابت القديم اتحذف — المدة صارت إعداد قابل للتحكم، راجع SPIN_DURATION_OPTIONS)
    var ROTATION_DEG_PER_SEC = 22;
    var RING_TICK_MS = 90;
    var ELIMINATE_STAGGER_MS = 550;
    // (ما نحتاج مدة تثبيت أو اختفاء تلقائي بعد الآن — الإغلاق يدوي بالكامل بزر ✕)
    var NEXT_ROUND_DELAY_MS = 2200;
    // ⚠️ جاهزة تستقبل 10 لكل تصنيف (5 حالية + 5 إضافية قادمة) — بس خليتها
    // 5 فعلياً حالياً حتى ما تصير محاولات تشغيل ملفات غير مرفوعة بعد (صمت
    // صوتي نصف الوقت). أول ما ترفع 6.mp3...10.mp3 بنفس مسار shailat/
    // وkhaleeji/، غيّر الرقم تحت لـ10 وخلاص — بدون أي تعديل ثاني بالكود.
    var MUSIC_TRACK_COUNT = 5;
    var IRAQI_TRACK_COUNT = 10; // ⚠️ 10 مقاطع مرفوعة فعلياً بمجلد sounds/iraqi/ (5 + 5 إضافية) — شغّالة الآن
    var SPIN_DURATION_MAX_S = 35; // ⚠️ الحد الأقصى لمدة تدوير الموسيقى (طلب صريح)

    /* ======================================================================
     *  0) الصوت — مستوى صوت واحد موحَّد لكل شي (مؤثرات قصيرة + موسيقى
     *     طويلة) يُتحكَّم فيه حياً من تبويب الأصوات باللعبة فقط — لا يوجد
     *     أي حقل صوت منفصل بشاشة الإعدادات (حُذف بالكامل بطلب صريح).
     * ==================================================================== */
    var SOUND_BASE = 'sounds/';
    var _sounds = {
        reveal: new Audio(SOUND_BASE + 'reveal.wav'),
        claim: new Audio(SOUND_BASE + 'claim.wav'),
        eliminate: new Audio(SOUND_BASE + 'eliminate.wav'),
        warning: new Audio(SOUND_BASE + 'warning.wav'),
        winner: new Audio(SOUND_BASE + 'winner.wav')
    };

    function playSound(name) {
        var a = _sounds[name];
        if (!a) return;
        try {
            a.volume = _musicMuted ? 0 : _musicVolume; // ⚠️ نفس مستوى/كتم الموسيقى الحي — مصدر واحد موحَّد
            a.currentTime = 0;
            var p = a.play();
            if (p && typeof p.catch === 'function') { p.catch(function () {}); }
        } catch (e) { /* تجاهل صامت — الصوت طبقة تحسين، لا يوقف اللعبة */ }
    }

    // طبقة الموسيقى الطويلة — ثلاث تصنيفات (شيلات/خليجية جاهزتين، عراقية
    // مجهَّزة الآن بالكود بانتظار الملفات الفعلية منك — راجع الملاحظة
    // بآخر الرسالة).
    var _musicTracks = { shailat: [], khaleeji: [], iraqi: [] };
    for (var mi = 1; mi <= MUSIC_TRACK_COUNT; mi++) {
        _musicTracks.shailat.push(SOUND_BASE + 'shailat/' + mi + '.mp3');
        _musicTracks.khaleeji.push(SOUND_BASE + 'khaleeji/' + mi + '.mp3');
    }
    for (var mj = 1; mj <= IRAQI_TRACK_COUNT; mj++) {
        _musicTracks.iraqi.push(SOUND_BASE + 'iraqi/' + mj + '.mp3');
    }

    var _musicMode = 'random';   // 'random' | 'shailat' | 'khaleeji' | 'iraqi' — يتحكم فيه الاستريمر حياً
    var _musicMuted = false;
    var _musicVolume = 0.7;      // 0..1 — المصدر الوحيد للصوت بكل اللعبة (مؤثرات + موسيقى)
    var _currentMusicAudio = null;
    var _lastMusicUrl = null;    // ⚠️ لمنع تكرار نفس المقطع بالتوالي (طلب صريح)

    // ⚠️ عشوائي حقيقي بدون تكرار نفس المقطع مرتين متتاليتين (ولا بالترتيب)
    // — يستبعد آخر مقطع اتشغّل من قائمة المرشّحين قبل الاختيار، لو
    // القسم فيه أكثر من مقطع وحد.
    function pickMusicUrl() {
        var pool;
        if (_musicMode === 'shailat') pool = _musicTracks.shailat;
        else if (_musicMode === 'khaleeji') pool = _musicTracks.khaleeji;
        else if (_musicMode === 'iraqi') pool = _musicTracks.iraqi;
        // ⚠️ العراقية صارت جزء من الخلط "عشوائي" العام كمان (نفس مستوى
        // شيلات/خليجية) — بطلب صريح. بما إن IRAQI_TRACK_COUNT لسه 0
        // (ما رفعت الملفات بعد)، هالسطر ما يأثر على شي حالياً — أول ما
        // ترفع الملفات وترفع العدد لـ10، تدخل تلقائياً بكل الأوضاع
        // (خاصتها + الخلط العام) بدون أي تعديل ثاني.
        else pool = _musicTracks.shailat.concat(_musicTracks.khaleeji).concat(_musicTracks.iraqi);

        if (!pool || !pool.length) return null;
        var candidates = pool;
        if (pool.length > 1 && _lastMusicUrl) {
            candidates = pool.filter(function (u) { return u !== _lastMusicUrl; });
        }
        var url = candidates[Math.floor(Math.random() * candidates.length)];
        _lastMusicUrl = url;
        return url;
    }

    function startMusic() {
        stopMusic();
        var url = pickMusicUrl();
        if (!url) return; // ⚠️ قسم بدون ملفات مرفوعة بعد (مثل "عراقية" حالياً) — صمت آمن، بدون خطأ
        var audio = new Audio(url);
        audio.loop = true; // لو انتهى المقطع قبل توقف الدوران، يعيد تلقائياً
        audio.volume = _musicMuted ? 0 : _musicVolume;
        _currentMusicAudio = audio;
        try {
            var p = audio.play();
            if (p && typeof p.catch === 'function') { p.catch(function () {}); }
        } catch (e) { /* تجاهل صامت */ }
    }

    function stopMusic() {
        if (_currentMusicAudio) {
            try { _currentMusicAudio.pause(); _currentMusicAudio.currentTime = 0; } catch (e) {}
            _currentMusicAudio = null;
        }
    }

    function applyMusicVolumeLive() {
        if (_currentMusicAudio) _currentMusicAudio.volume = _musicMuted ? 0 : _musicVolume;
    }

    /* ======================================================================
     *  1) حالة المباراة الداخلية
     * ==================================================================== */
    var _settings = {};
    var _matchActive = false;
    var _startedAt = 0;
    var _alive = [];
    var _eliminated = [];
    var _roundNumber = 0;
    var _customDeficitCurrent = 1;
    var _roundDeficit = 1; // ⚠️ جديد: العجز المستخدَم فعلياً بالدورة الحالية (يلزم addChairsIfNeeded)

    var _chairs = [];
    var _seatedThisRound = {};
    var _playerAngle = {};

    var _ringTimer = null;
    var _ringRotation = 0;
    var _ringSpinning = false;   // ⚠️ جديد: هل الحلقة تدور الآن فعلياً (لحساب الزاوية بأي وقت)
    var _spinTimeoutId = null;
    var _spinState = 'idle';     // 'idle' | 'spinning' — حالة زر التدوير اليدوي
    var _selectionOpen = false;

    var _commentUnsub = null;
    var _playerRemovedUnsub = null;
    var _playerJoinedUnsub = null;
    var _timerTickUnsub = null;
    var _timerEndedUnsub = null;

    function resetMatchState() {
        _matchActive = false;
        _alive = [];
        _eliminated = [];
        _roundNumber = 0;
        _customDeficitCurrent = 1;
        _chairs = [];
        _seatedThisRound = {};
        _playerAngle = {};
        stopRingLoop();
        stopMusic();
        _spinState = 'idle';
        if (_spinTimeoutId) { clearTimeout(_spinTimeoutId); _spinTimeoutId = null; }
        AGP.timerManager.stop(TIMER_NAME);
        _selectionOpen = false;
        unwireCommentListener();
        // ⚠️ احتياط: لو تبويب المُقصَين انفتح ولسه ما انقفل يدوياً (مباراة
        // جديدة/إعادة مباراة قبل ما يقفله الاستريمر)، نخفيه حتى ما يعلق
        var elimPanel = el('mc-eliminated-panel');
        if (elimPanel) elimPanel.classList.remove('mc-eliminated-visible');
    }

    function el(id) { return document.getElementById(id); }
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }
    function playerLabel(p) { return (p && (p.name || p.id)) || '—'; }
    function tiktokUsernameFor(player) {
        var id = (player && player.id) || '';
        if (id.indexOf('tiktok:') === 0) return id.slice('tiktok:'.length);
        return (player && (player.name || player.id)) || '';
    }
    function liveSettings() {
        return (AGP.gameShell && typeof AGP.gameShell.getSettings === 'function') ? AGP.gameShell.getSettings() : (_settings || {});
    }

    /* ======================================================================
     *  2) حقول شاشة الإعدادات
     * ==================================================================== */
    function buildSettingsFields() {
        return [
            { key: 'maxPlayers', type: 'counter', label: '👥 الحد الأقصى لعدد اللاعبين بالمباراة', min: 3, default: 24 },
            {
                key: 'followersOnly', type: 'pill-choice', label: '🔑 مين يقدر يدخل؟',
                options: [{ label: 'الكل', value: false }, { label: 'المتابعون فقط', value: true }],
                default: false
            },
            {
                key: 'chairDeficitMode', type: 'pill-choice', label: '🪑 طريقة نقصان الكراسي',
                options: [
                    { label: 'تلقائي (كرسي واحد كل دورة)', value: 'auto' },
                    { label: 'مخصّص (أحدده بنفسي)', value: 'custom' }
                ],
                default: 'auto'
            },
            {
                key: 'customDeficitStart', type: 'counter', label: '➖ عدد الكراسي الناقصة أول دورة',
                min: 1, default: 5, showWhen: { key: 'chairDeficitMode', equals: 'custom' }
            },
            {
                key: 'selectionTimerSeconds', type: 'pill-group', label: '⏱️ مهلة اختيار الكرسي',
                options: SELECTION_TIMER_OPTIONS, default: 15
            },
            {
                key: 'spinDurationSeconds', type: 'pill-group', label: '🎵 مدة تدوير الموسيقى',
                options: SPIN_DURATION_OPTIONS, default: 15
            }
        ];
    }

    /* ======================================================================
     *  3) الأنماط
     *     ألوان: بنفسج المنصة الرسمي (--agp-accent)، سماوي المنصة الرسمي
     *     (--agp-accent-2)، وردي المنصة الرسمي (--agp-accent-pink)، ذهبي
     *     خاص بالكراسي (--mc-gold). شريط الأدوات ولوحة "عدد اللاعبين"
     *     مبنيان حرفياً على القيم اللي زوَّدنا بها صاحب المشروع من Figma
     *     (تعبئة #CAB6B6 + حد #9F5FC4 بسماكة 4 من الداخل + استدارة 35) —
     *     نفس القيم انطبقت على بادج "عدد الكراسي" أيضاً لتناسق الشريط، لأن
     *     ما وصلتنا قيم منفصلة له. باقي عناصر الشريط (زر التدوير، السلايدر،
     *     زر نوع الموسيقى) صممتها بذوقي متناسقة مع نفس اللوحة والصورة
     *     المرجعية المرسلة — تُعدَّل يدوياً بسهولة لاحقاً لو الألوان ما
     *     عجبتك بالضبط.
     * ==================================================================== */
    function injectStageStyles() {
        if (el('mc-stage-styles')) return;
        var style = document.createElement('style');
        style.id = 'mc-stage-styles';
        style.textContent = [
            ':root{--mc-gold:#ffb020;--mc-gold-2:#ff7a3d;--mc-danger:#ff4d6a;--mc-badge-fill:#CAB6B6;--mc-badge-stroke:#9F5FC4;--mc-video-glow:#4d0008;}',

            /* ⚠️ إصلاح: كانت الحلبة محبوسة بحجم الشاشة (fixed inset:0
             * بدون تمرير) — لو المحتوى أطول من الشاشة (تكبير كبير، شاشة
             * قصيرة) ما فيه طريقة توصل لباقي الدائرة. الحل: overflow-y
             * يخلي الحلبة نفسها قابلة للتمرير عمودياً لو احتاجت، بدون ما
             * يأثر على الهيدر الثابت فوقها.
             * ⚠️ إصلاح إضافي (شكوى فعلية): كان شريط التمرير يظهر ويختفي
             * بشكل متكرر ومزعج مع تغيّر نص شريط الأدوات بين المراحل
             * (جاهز/دوران/اختيار/إقصاء)، لأن عرض السطر يتغيّر فيتسبب
             * أحياناً بارتفاع محتوى إضافي بسيط. scrollbar-gutter:stable
             * يحجز مساحة شريط التمرير دائماً (يظهر أو لا) فما يصير أي
             * قفز/رجّة بالتخطيط، + min-height ثابت للشريط يقلّل تغيّر
             * الارتفاع بين المراحل من الأساس. */
            '#mc-stage{position:fixed;inset:0;overflow-y:auto;scrollbar-gutter:stable;',
            'padding-top:78px;padding-bottom:24px;',
            'display:flex;flex-direction:column;',
            'align-items:center;z-index:10;font-family:Cairo,sans-serif;direction:rtl;}',

            /* ⚠️ دُمج شريط الدورة وشريط الأدوات بشريط واحد موسّع، بمكان
             * عنوان "الدورة" السابق تماماً (فوق الحلقة مباشرة) — كل
             * التفاصيل (عدد اللاعبين، الكراسي، رقم الدورة، نوع الموسيقى،
             * الصوت، زر التدوير) بداخله. عرَّضته لعرض أدنى ثابت 760px
             * على الشاشات الواسعة (يتقلّص تلقائياً بالجوال). عدّل الرقم
             * 760 لأي رقم تبيه بالضبط. min-height ثابت (بدل ارتفاع
             * تلقائي متغيّر) يمنع "قفزة" الحلبة تحته كل ما تغيّر نص
             * المرحلة (سبب شريط التمرير المزعج). */
            '#mc-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;',
            'margin:14px auto 8px;padding:12px 20px;width:min(94vw,760px);min-height:76px;box-sizing:border-box;',
            'border-radius:24px;',
            'background:linear-gradient(90deg,#3a1750,#2D1932);border:2px solid var(--mc-badge-stroke);',
            'box-shadow:0 4px 18px rgba(0,0,0,0.35);}',

            '#mc-round-info{font-size:0.88em;color:#e9d3ff;white-space:nowrap;font-weight:700;}',
            '#mc-round-info .mc-round-num-inline{color:var(--mc-gold);font-weight:900;}',

            '.mc-spin-btn{border:none;border-radius:999px;padding:9px 20px;font-weight:800;font-size:0.95em;',
            'color:#fff;cursor:pointer;background:linear-gradient(90deg,var(--agp-accent-pink),var(--agp-accent));',
            'box-shadow:0 0 10px rgba(255,77,255,0.45);transition:transform .15s;}',
            '.mc-spin-btn:active{transform:scale(0.96);}',
            '.mc-spin-btn.mc-spin-btn-active{background:linear-gradient(90deg,#ff6161,#c81452);}',
            '.mc-spin-btn:disabled{opacity:0.45;cursor:not-allowed;}',

            '#mc-spin-countdown{font-weight:800;font-size:0.85em;color:var(--mc-gold);min-width:34px;text-align:center;}',

            '.mc-volume-group{display:flex;align-items:center;gap:6px;background:rgba(0,0,0,0.25);',
            'border-radius:999px;padding:4px 10px;}',
            '.mc-icon-btn{border:none;background:none;color:#fff;font-size:1.05em;cursor:pointer;line-height:1;padding:2px;}',
            '#mc-volume-slider{width:80px;accent-color:var(--mc-gold);cursor:pointer;}',

            '.mc-music-mode{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;}',
            '.mc-music-mode-label{font-size:0.68em;color:#d9c3ef;font-weight:700;white-space:nowrap;}',
            '.mc-music-mode-btn{border:none;border-radius:999px;padding:9px 16px;font-weight:800;font-size:0.85em;',
            'color:#fff;background:#141018;border:1px solid #3a3040;cursor:pointer;display:flex;align-items:center;gap:6px;}',
            '.mc-music-mode-options{position:absolute;top:calc(100% + 4px);right:0;background:#1c1424;border:1px solid var(--mc-badge-stroke);',
            'border-radius:12px;padding:6px;display:flex;flex-direction:column;gap:4px;min-width:150px;z-index:50;',
            'box-shadow:0 6px 18px rgba(0,0,0,0.5);}',
            '.mc-music-mode-options[hidden]{display:none;}',
            '.mc-music-mode-options button{border:none;background:none;color:#f3eefc;text-align:right;padding:7px 10px;',
            'border-radius:8px;font-size:0.85em;cursor:pointer;font-family:Cairo,sans-serif;}',
            '.mc-music-mode-options button:hover,.mc-music-mode-options button.mc-mode-active{background:var(--agp-accent);color:#fff;}',

            '.mc-badge{border:4px solid var(--mc-badge-stroke);background:var(--mc-badge-fill);',
            'border-radius:35px;padding:9px 16px;font-weight:800;font-size:0.85em;color:#2b1240;',
            'box-sizing:border-box;min-height:52px;display:flex;align-items:center;gap:6px;white-space:nowrap;}',

            '#mc-countdown{margin-top:2px;font-weight:800;font-size:1.05em;color:var(--mc-gold);',
            'min-height:1.4em;display:flex;align-items:center;justify-content:center;gap:6px;}',
            '#mc-countdown.mc-countdown-warn{color:var(--mc-danger);}',

            /* ⚠️ تبويب المُقصَين — يظهر بمنتصف الشاشة، حجمه مرن يتمدد حسب
             * عدد اللاعبين المُقصَين (مو حجم ثابت)، حدود بنفسجية، داخله
             * أسود شبه شفاف، شعار المنصة بالأعلى. كل الأسماء والصور تظهر
             * دفعة وحدة وتثبت 3 ثوانٍ، وبعدين تختفي وحدة وحدة. */
            '#mc-eliminated-panel{position:fixed;top:50%;left:50%;',
            'transform:translate(-50%,-50%) scale(0.85);',
            'z-index:9997;width:auto;min-width:280px;max-width:92vw;height:auto;max-height:82vh;box-sizing:border-box;',
            'background:rgba(0,0,0,0.9);border:4px solid var(--agp-accent);border-radius:26px;',
            'padding:28px 32px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;opacity:0;',
            'pointer-events:none;transition:opacity .3s ease,transform .3s ease;',
            'box-shadow:0 0 34px rgba(124,58,237,0.55);}',
            '#mc-eliminated-panel.mc-eliminated-visible{opacity:1;transform:translate(-50%,-50%) scale(1);pointer-events:auto;}',
            '.mc-eliminated-logo{width:64px;height:64px;object-fit:contain;flex-shrink:0;}',
            '.mc-eliminated-title{color:#fff;font-weight:800;font-size:1.2em;white-space:nowrap;}',
            /* ⚠️ زر إغلاق يدوي — الطريقة الوحيدة لإخفاء التبويب الآن */
            '.mc-eliminated-close-btn{position:absolute;top:14px;left:14px;width:34px;height:34px;',
            'border-radius:50%;background:rgba(255,255,255,0.12);border:2px solid #fff;color:#fff;',
            'font-size:1.05em;font-weight:900;cursor:pointer;display:flex;align-items:center;',
            'justify-content:center;z-index:5;padding:0;line-height:1;pointer-events:auto;}',
            '.mc-eliminated-close-btn:hover{background:rgba(255,255,255,0.28);}',
            '.mc-eliminated-avatars{display:flex;gap:20px 24px;flex-wrap:wrap;justify-content:center;',
            'align-items:flex-start;max-width:min(640px,88vw);max-height:56vh;overflow-y:auto;padding:6px;}',
            '.mc-eliminated-avatar-item{position:relative;width:88px;height:88px;margin-bottom:30px;',
            'filter:grayscale(0.5);animation:mcElimPop .3s ease;transition:opacity .3s ease,transform .3s ease;}',
            '.mc-eliminated-avatar-item.mc-eliminated-item-out{opacity:0;transform:scale(0.4);}',
            '@keyframes mcElimPop{0%{transform:scale(0);opacity:0;}100%{transform:scale(1);opacity:1;}}',
            '.mc-eliminated-avatar-item .mc-avatar-img,.mc-eliminated-avatar-item .mc-avatar-fallback{',
            'width:100%;height:100%;border-radius:50%;object-fit:cover;border:3px solid var(--mc-danger);background:#2c1240;}',
            '.mc-eliminated-avatar-item .mc-avatar-fallback{display:flex;align-items:center;justify-content:center;',
            'color:#fff;font-weight:800;font-size:1em;}',
            /* ⚠️ اسم واضح كامل تحت كل صورة — بدون قصّ (مو ellipsis زي قبل)،
             * يلف لسطرين لو طويل. خط مضاعف الحجم (0.78em → 1.56em) بطلب
             * صريح، مع توسيع اللوح شوي عشان يفسح للخط الأكبر. */
            '.mc-eliminated-avatar-item .mc-avatar-name{position:absolute;top:100%;left:50%;transform:translateX(-50%);',
            'margin-top:8px;font-size:1.56em;font-weight:700;color:#fff;background:rgba(0,0,0,0.75);padding:3px 10px;',
            'border-radius:10px;white-space:normal;max-width:160px;text-align:center;line-height:1.25;}',


            /* ⚠️ إصلاح جذري لمشكلة تشوّه الدائرة عند تكبير المتصفح (Zoom) —
             * بدل حساب height بمعادلة width منفصلة (كانت تنكسر مع بعض
             * نسب التكبير)، نستخدم aspect-ratio:1/1 اللي يفرض مربّعاً
             * مثالياً دائماً بغض النظر عن حجم الشاشة أو نسبة التكبير —
             * الارتفاع يُشتق تلقائياً من العرض، صفر احتمال تشوّه. */
            '#mc-circle-wrap{position:relative;width:min(62vw,600px);aspect-ratio:1/1;',
            'min-width:320px;margin:10px auto;}',
            '#mc-circle-glow{position:absolute;inset:8%;border-radius:50%;',
            'background:radial-gradient(circle,rgba(124,58,237,0.28),transparent 70%);pointer-events:none;}',
            /* ⚠️ شعار المنصة بمنتصف الحلبة، خلف الكراسي تماماً (قبلها
             * بترتيب DOM، فيطلع تحتها تلقائياً بدون أي z-index يدوي)،
             * شفاف بشكل خفيف حتى ما يعيق قراءة أرقام الكراسي فوقه. */
            '#mc-circle-logo{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
            'width:36%;height:36%;object-fit:contain;opacity:0.16;pointer-events:none;filter:grayscale(0.15);}',
            /* ⚠️ إصلاح: التصميم الأول (conic-gradient + mask + filter) كان
             * يسبب تشوه بصري حقيقي ببعض المتصفحات (خط ملتوي يمتد خارج
             * الدائرة، يتضخم كل ما كبرت نافذة المتصفح) — لاحظه المستخدم
             * فعلياً بالصورة. الحل الآمن: نفس التأثير (حلقة متدرّجة الألوان
             * تدور ببطء) بس بتقنية "حدود متدرّجة" (background مزدوج
             * padding-box/border-box) بدل mask — تقنية مستقرة 100% بكل
             * المتصفحات، بدون أي فلتر متراكب معها. */
            '#mc-circle-track{position:absolute;inset:0;border-radius:50%;pointer-events:none;',
            'border:3px solid transparent;box-sizing:border-box;',
            'background:linear-gradient(#1a0d2e,#1a0d2e) padding-box,',
            'conic-gradient(from 0deg,var(--agp-accent),var(--agp-accent-2),var(--mc-gold),',
            'var(--agp-accent-pink),var(--agp-accent)) border-box;',
            'box-shadow:0 0 18px rgba(124,58,237,0.45);',
            'animation:mcTrackSpin 8s linear infinite;}',
            '@keyframes mcTrackSpin{to{transform:rotate(360deg);}}',
            '#mc-chairs-ring{position:absolute;inset:0;}',
            '#mc-players-ring{position:absolute;inset:0;}',

            /* ⚠️ الكرسي صار صورة فوتوغرافية حقيقية (نسبة عرض:ارتفاع طبيعية
             * ~0.67، أطول من عرضها) بدل الرسم المربّع القديم — الحاوية
             * صارت مستطيلة تناسب شكلها الطبيعي بدل مربّع، وobject-fit:
             * contain يحافظ على تناسق الصورة بدون أي تمديد أو تشويه. */
            '.mc-chair{position:absolute;width:13%;height:19%;transform:translate(-50%,-50%);',
            'display:flex;align-items:center;justify-content:center;}',
            '.mc-chair-svg{width:100%;height:100%;object-fit:contain;',
            'filter:drop-shadow(0 0 8px rgba(255,176,32,0.55));transition:filter .25s;}',
            '.mc-chair.mc-chair-taken .mc-chair-svg{filter:drop-shadow(0 0 14px rgba(124,58,237,0.9));}',
            /* ⚠️ تكبير + توضيح رقم الكرسي — خلفية سوداء + رقم أبيض، عشان
             * يبين واضح بشاشات الجوال بالبث (كان اللون الذهبي صعب يبين
             * على المشاهدين). */
            '.mc-chair-number{position:absolute;top:0%;left:50%;transform:translateX(-50%) scale(0);',
            'background:#000;color:#fff;border:2px solid var(--mc-gold);',
            'font-weight:900;font-size:1.5em;border-radius:999px;padding:3px 13px;min-width:1.5em;text-align:center;',
            'box-shadow:0 0 12px rgba(0,0,0,0.85);transition:transform .35s cubic-bezier(.34,1.56,.64,1);}',
            '.mc-chair.mc-chair-revealed .mc-chair-number{transform:translateX(-50%) scale(1);}',
            '.mc-chair.mc-chair-taken .mc-chair-number{border-color:var(--agp-accent-2);}',

            '.mc-avatar{position:absolute;width:11%;height:11%;transform:translate(-50%,-50%);',
            'display:flex;align-items:center;justify-content:center;transition:left .1s linear,top .1s linear;}',
            '.mc-avatar.mc-avatar-seating{transition:left .5s cubic-bezier(.34,1.56,.64,1),top .5s cubic-bezier(.34,1.56,.64,1);}',
            '.mc-avatar-img,.mc-avatar-fallback{width:100%;height:100%;border-radius:50%;object-fit:cover;',
            'border:2px solid var(--agp-accent-2);box-shadow:0 0 10px rgba(0,194,255,0.55);background:#2c1240;}',
            '.mc-avatar-fallback{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:0.85em;}',
            '.mc-avatar-name{position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);',
            'font-size:0.62em;color:#f3eefc;background:rgba(8,4,16,0.65);padding:1px 6px;border-radius:999px;',
            'white-space:nowrap;max-width:70px;overflow:hidden;text-overflow:ellipsis;}',
            '.mc-avatar.mc-avatar-safe .mc-avatar-img,.mc-avatar.mc-avatar-safe .mc-avatar-fallback{',
            'border-color:#2fbf71;box-shadow:0 0 12px rgba(47,191,113,0.85);}',
            '@keyframes mcSeatPop{0%{transform:translate(-50%,-50%) scale(1);}45%{transform:translate(-50%,-50%) scale(1.28);}100%{transform:translate(-50%,-50%) scale(1);}}',
            '.mc-avatar.mc-avatar-safe{animation:mcSeatPop .4s ease;}',
            '@keyframes mcShakeOut{0%{transform:translate(-50%,-50%) rotate(0) scale(1);opacity:1;}',
            '20%{transform:translate(-50%,-50%) rotate(-14deg) scale(1.05);}',
            '40%{transform:translate(-50%,-50%) rotate(12deg) scale(1.05);}',
            '60%{transform:translate(-50%,-50%) rotate(-10deg) scale(0.95);}',
            '100%{transform:translate(-50%,-50%) translateY(40px) rotate(20deg) scale(0.35);opacity:0;}}',
            '.mc-avatar.mc-avatar-out{animation:mcShakeOut .6s ease forwards;filter:grayscale(1) drop-shadow(0 0 14px rgba(255,77,106,0.9));}',
            '@keyframes mcJoinPop{0%{transform:translate(-50%,-50%) scale(0);opacity:0;}100%{transform:translate(-50%,-50%) scale(1);opacity:1;}}',
            '.mc-avatar.mc-avatar-joining{animation:mcJoinPop .35s ease;}',

            '#mc-toast-wrap{position:fixed;top:78px;left:50%;transform:translateX(-50%);z-index:99996;',
            'display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;}',
            '.mc-toast{background:rgba(20,8,35,0.92);border:1px solid var(--mc-gold);color:#fff;',
            'padding:8px 18px;border-radius:999px;font-size:0.85em;font-weight:700;',
            'box-shadow:0 0 14px rgba(255,176,32,0.4);animation:mcToastIn .25s ease;}',
            '@keyframes mcToastIn{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}',

            /* شاشة الفائز + فيديو الاحتفال */
            /* ⚠️ إزالة الخلفية البنفسجية/الحدود/التوهج عن صندوق الشل خاص
             * بشاشة الفائز فقط (Override محلي بملفي، بدون أي لمس لملف
             * agp-game-shell.js المشترك) — يبقى المحتوى (العنوان، الفيديو،
             * البطاقة، الأزرار) عائم مباشرة بدون لوحة خلفية حوله. */
            '#agp-shell-box.mc-winner-screen{background:none !important;',
            'border:none !important;box-shadow:none !important;}',
            '.mc-winner-screen h2{background:linear-gradient(90deg,var(--mc-gold),var(--agp-accent-2));',
            '-webkit-background-clip:text;background-clip:text;color:transparent;}',
            /* ⚠️ خلفية مغبّشة (Glassmorphism) على صندوق الفيديو — تتّسق
             * بصرياً مع زجاجية البطاقة الرسمية المشتركة (.agp-trophy-card)
             * تحته مباشرة، بدل الخلفية المصمتة القديمة. */
            '.mc-winner-video-wrap{width:250px;height:250px;margin:6px auto 14px;border-radius:18px;',
            'overflow:hidden;position:relative;border:3px solid var(--mc-video-glow);',
            'background:rgba(101,98,98,0.5);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);',
            'box-shadow:0 0 18px var(--mc-video-glow),0 0 38px var(--mc-video-glow);',
            'animation:mcVideoPulse 1.8s ease-in-out infinite;}',
            '@keyframes mcVideoPulse{0%,100%{box-shadow:0 0 14px var(--mc-video-glow),0 0 26px var(--mc-video-glow);}',
            '50%{box-shadow:0 0 22px var(--mc-video-glow),0 0 48px var(--mc-video-glow);}}',
            '.mc-winner-video-wrap video{width:100%;height:100%;object-fit:cover;display:block;}',
            '.mc-winner-video-unmute{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);',
            'background:rgba(0,0,0,0.55);color:#fff;border:none;border-radius:999px;padding:5px 12px;',
            'font-size:0.8em;cursor:pointer;font-family:Cairo,sans-serif;}',
            /* ⚠️ حاوية توسيط بس لبطاقة AGP.playerCard.renderTrophyCard —
             * البطاقة نفسها بدون أي تعديل على تصميمها (من الملف المشترك). */
            '.mc-trophy-wrap{display:flex;justify-content:center;margin:0 0 14px;}',
            '.mc-winner-video-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;',
            'font-size:3em;background:rgba(0,0,0,0.3);}',

            /* ⚠️ جديد: زرّي نهاية المباراة بجانب بعض، كل وحد عرضه 350px بالضبط — طلب صريح */
            '.mc-winner-actions{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;width:100%;}',
            '.mc-winner-action-btn{width:350px;max-width:90vw;margin-top:0 !important;}',

            /* ⚠️ تحسين وضوح زر إغلاق (✕) لوحة الإعدادات — خاص بصفحة الكراسي
             * الموسيقية فقط عبر override بملفنا، بدون أي لمس لملف
             * js/agp-game-shell.js المشترك (قرار صريح من صاحب المشروع). */
            '#agp-settings-close-btn{color:#fff !important;background:rgba(0,0,0,0.35) !important;',
            'width:38px;height:38px;border-radius:50%;display:flex !important;align-items:center;',
            'justify-content:center;box-shadow:0 0 8px rgba(0,0,0,0.55);font-size:1.5em !important;}',

            /* ⚠️ اسم اللعبة بجانب عنوان اللوبي — بلون ذهبي مميّز عن باقي النص */
            '.mc-lobby-game-tag{color:var(--mc-gold);}',

            /* ======================================================================
             * ⚠️ تحسينات شاشة اللوبي (شبكة اللاعبين + صف الأزرار) — بدون
             * أي تغيير على لون خلفية صندوق اللوبي نفسه (قرار صريح).
             * ==================================================================== */
            '#agp-shell-box.agp-lobby-box{height:900px !important;max-height:92vh !important;',
            'overflow-y:auto !important;display:flex !important;flex-direction:column;}',

            /* ======================================================================
             * ⚠️ [تحديث] نظام لوبي-قياسي-v1 (docs/PLAYER-CARD-STANDARDS.md
             * قسم 3/4/7 — دورت عليه بأحدث نسخة من المستودع وما لقيته
             * (يبدو ما انرفع لـGitHub بعد)، فطبّقت بالحرف الأرقام اللي
             * زوَّدتني فيها مباشرة برسالتك + معايير لوبي-قياسي-v1
             * المحفوظة عندي من محادثات سابقة (تطابقت مع كلامك 100%):
             * بطاقة 60px، تراكب 22%، لوح اسم عرض ثابت واحد (بدون
             * min/max)، 3 أعمدة، فجوة 0.5سم، × فوق لوح الاسم، وسلايد
             * للأسماء الطويلة بدل القصّ. حذفت نظام "البطاقة العريضة"
             * والتصغير التلقائي من التحديث اللي فات (يخالف مبدأ "ثابت
             * بدون تغيّر" بالمعيار الجديد). */
            '#agp-lobby-list.agp-shell-player-list{',
            '--mc-av:60px;--mc-nw:200px;--mc-nh:60px;--mc-overlap:13px;--mc-nf:18px;--mc-gap:19px;',
            'display:grid !important;grid-template-columns:repeat(4,1fr);',
            'gap:var(--mc-gap) !important;margin-top:34px !important;list-style:none;padding:0;',
            'justify-items:center;}',
            '#agp-lobby-list.agp-shell-player-list li{position:relative;display:flex;align-items:center;',
            'justify-content:center;min-height:78px;}',

            /* ⚠️ إصلاح باگ حقيقي: الغلاف .agp-pcard عنده خلفية/حدود/حشو
             * خاصة فيه بالملف المشترك (pill شفافة تحيط بالأفاتار+الاسم
             * سوا) — وأنا زدت خلفية ثانية منفصلة على لوح الاسم فوقها،
             * فطلعت خلفيتين متراكبتين. الحل: نلغي خلفية الغلاف الخارجي
             * تماماً، تبقى خلفية لوح الاسم هي الوحيدة الظاهرة. */
            '#agp-lobby-list .agp-pcard{display:flex !important;align-items:center;gap:0 !important;',
            'background:none !important;border:none !important;padding:0 !important;',
            'max-width:none !important;}',
            '#agp-lobby-list .agp-pcard-avatar-basic{width:var(--mc-av) !important;height:var(--mc-av) !important;',
            'flex-shrink:0;position:relative;z-index:2;border-radius:50%;}',
            '#agp-lobby-list .agp-pcard-name-basic{display:flex !important;align-items:center;',
            'justify-content:flex-start;width:var(--mc-nw) !important;min-width:var(--mc-nw) !important;',
            'max-width:var(--mc-nw) !important;height:var(--mc-nh);',
            'margin-inline-start:calc(-1 * var(--mc-overlap)) !important;',
            'padding-inline-start:calc(var(--mc-overlap) + 10px);padding-inline-end:14px;',
            'font-size:var(--mc-nf) !important;background:rgba(255,255,255,0.08);',
            'border:1px solid rgba(255,255,255,0.25);border-radius:999px;',
            'white-space:nowrap;overflow:hidden;box-sizing:border-box;position:relative;z-index:1;color:#fff;}',
            /* ⚠️ سلايد للاسم الطويل (بدل القصّ بـellipsis) — نغلّف النص
             * بـ .mc-name-inner من JS، ونحرّكه أفقياً لو فاض عن اللوح */
            '#agp-lobby-list .agp-pcard-name-basic .mc-name-inner{display:inline-block;white-space:nowrap;}',
            '#agp-lobby-list .agp-pcard-name-basic.mc-name-overflow .mc-name-inner{',
            'animation:mcNameSlide 3.2s ease-in-out infinite alternate;}',
            '@keyframes mcNameSlide{0%,15%{transform:translateX(0);}85%,100%{transform:translateX(var(--mc-name-shift,0px));}}',

            /* بطاقة مؤطَّرة (Option A) — عرض هدف ثابت = نفس عرض البطاقة
             * العادية، الارتفاع ناتج تلقائياً حسب نسبة كل إطار (zoom لكل
             * بطاقة على حدة، محسوب بـJS من عرضها الطبيعي الفعلي — راجع
             * normalizeFramedCardWidths). */
            '#agp-lobby-list .agp-pcard-tpl{transform-origin:top right;}',

            '.mc-lobby-remove-btn{position:absolute;top:-8px;left:6px;width:22px;height:22px;',
            'border-radius:50%;background:#ff3b5c;border:2px solid #fff;color:#fff;font-size:11px;',
            'font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer;',
            'z-index:5;padding:0;line-height:1;}',
            '.mc-lobby-remove-btn:hover{background:#ff5c78;}',

            /* ⚠️ إصلاح: 360px×3 أزرار = 1080px، أعرض من محتوى صندوق اللوبي
             * الصافي (832px)، فكانت تنزل كل وحدة لسطر لحالها (flex-wrap
             * يشتغل قسراً). الحل: flex-wrap:nowrap (يمنع النزول لسطر
             * ثاني نهائياً) + عرض مرن يتقاسم المساحة المتاحة (يتساوى مع
             * 3 أزرار براحة داخل نفس الصف).
             * ⚠️ إصلاح إضافي: زر بدء الجولة (#agp-start-round-btn) يحمل
             * كلاس مشترك (.agp-shell-btn-connect) فيه width:100% بنفس
             * درجة الأولوية (specificity) تماماً — أحياناً يكسب حسب ترتيب
             * الحقن بالصفحة. !important هنا يضمن غلبة تنسيقي دائماً
             * بغض النظر عن الترتيب، بدون أي لمس للملف المشترك نفسه. */
            '.mc-lobby-actions-row{display:flex !important;gap:10px !important;justify-content:center !important;',
            'margin-top:auto !important;padding-top:18px;flex-wrap:nowrap !important;width:100% !important;',
            'box-sizing:border-box;}',
            '.mc-lobby-actions-row > *{flex:1 1 0 !important;width:auto !important;min-width:0 !important;',
            'max-width:270px !important;height:48px !important;border-radius:10px;',
            'font-weight:800;font-size:0.82em;cursor:pointer;border:none;display:flex !important;',
            'align-items:center;justify-content:center;gap:6px;box-sizing:border-box;font-family:Cairo,sans-serif;',
            'text-decoration:none;padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
            'margin:0 !important;}',
            '.mc-lobby-back-settings-btn{background:linear-gradient(90deg,#4a1f5c,#2D1932);color:#fff;',
            'border:1px solid rgba(255,255,255,0.3) !important;}',
            '.mc-lobby-home-btn{background:linear-gradient(90deg,var(--agp-accent-2),var(--agp-accent));color:#fff;}',
            '#agp-start-round-btn.mc-lobby-start-btn{background:linear-gradient(90deg,#1fbf6a,#0e8f4e) !important;}',

            /* لوحة الإعدادات أثناء المباراة — زر رجوع للمنصة + إكس أبرز */
            '.mc-settings-home-btn{display:flex;align-items:center;justify-content:center;gap:6px;',
            'width:100%;max-width:360px;height:44px;margin:18px auto 0;border-radius:10px;',
            'background:linear-gradient(90deg,var(--agp-accent-2),var(--agp-accent));color:#fff;',
            'font-weight:800;font-size:0.9em;text-decoration:none;font-family:Cairo,sans-serif;',
            'box-sizing:border-box;}'
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  4) بناء الحلبة (Scaffolding)
     * ==================================================================== */
    function ensureScaffolding() {
        injectStageStyles();
        if (!el('mc-toast-wrap')) {
            var toastWrap = document.createElement('div');
            toastWrap.id = 'mc-toast-wrap';
            document.body.appendChild(toastWrap);
        }
        if (!el('mc-eliminated-panel')) {
            var elimPanel = document.createElement('div');
            elimPanel.id = 'mc-eliminated-panel';
            document.body.appendChild(elimPanel);
        }
        if (!el('mc-stage')) {
            var stage = document.createElement('div');
            stage.id = 'mc-stage';
            stage.innerHTML =
                '<div id="mc-toolbar">' +
                '<span class="mc-badge" id="mc-chairs-badge">🪑 <span id="mc-chairs-badge-num">0</span></span>' +
                '<span class="mc-badge" id="mc-players-badge">👥 <span id="mc-players-badge-num">0</span></span>' +
                '<span id="mc-round-info"><span class="mc-round-num-inline" id="mc-round-num"></span> — <span id="mc-round-sub"></span></span>' +
                '<div class="mc-music-mode">' +
                '<span class="mc-music-mode-label">اختار نوع الأغاني</span>' +
                '<button type="button" id="mc-music-mode-btn" class="mc-music-mode-btn">🔀 التشغيل العشوائي</button>' +
                '<div class="mc-music-mode-options" id="mc-music-mode-options" hidden>' +
                '<button type="button" data-mode="random">🔀 عشوائي</button>' +
                '<button type="button" data-mode="shailat">🎙️ شيلات</button>' +
                '<button type="button" data-mode="khaleeji">🎵 اغاني خليجية</button>' +
                '<button type="button" data-mode="iraqi">🎼 اغاني عراقية</button>' +
                '</div></div>' +
                '<div class="mc-volume-group">' +
                '<button type="button" id="mc-mute-btn" class="mc-icon-btn" title="كتم/تشغيل الصوت">🔊</button>' +
                '<input type="range" id="mc-volume-slider" min="0" max="100" value="70" title="مستوى الصوت">' +
                '</div>' +
                '<button type="button" id="mc-spin-btn" class="mc-spin-btn">▶️ تدوير</button>' +
                '<span id="mc-spin-countdown"></span>' +
                '</div>' +

                '<div id="mc-countdown"></div>' +
                '<div id="mc-circle-wrap">' +

                '<div id="mc-circle-glow"></div>' +
                '<div id="mc-circle-track"></div>' +
                '<img id="mc-circle-logo" src="../../logo.png" alt="">' +
                '<div id="mc-chairs-ring"></div>' +
                '<div id="mc-players-ring"></div>' +
                '</div>';
            document.body.appendChild(stage);
            wireToolbarEvents();
        }
    }

    function showToast(text) {
        var wrap = el('mc-toast-wrap');
        if (!wrap) return;
        var t = document.createElement('div');
        t.className = 'mc-toast';
        t.textContent = text;
        wrap.appendChild(t);
        setTimeout(function () {
            t.style.transition = 'opacity .3s';
            t.style.opacity = '0';
            setTimeout(function () { t.remove(); }, 320);
        }, 2600);
    }

    /* ======================================================================
     *  4ب) شريط الأدوات — تدوير يدوي + صوت الموسيقى + نوع الموسيقى + بادجات
     * ==================================================================== */
    function wireToolbarEvents() {
        var spinBtn = el('mc-spin-btn');
        if (spinBtn) spinBtn.onclick = handleSpinButtonClick;

        var muteBtn = el('mc-mute-btn');
        if (muteBtn) muteBtn.onclick = function () {
            _musicMuted = !_musicMuted;
            muteBtn.textContent = _musicMuted ? '🔇' : '🔊';
            applyMusicVolumeLive();
        };

        var volSlider = el('mc-volume-slider');
        if (volSlider) volSlider.oninput = function () {
            _musicVolume = Number(volSlider.value) / 100;
            if (_musicMuted && _musicVolume > 0) {
                _musicMuted = false;
                var mb = el('mc-mute-btn');
                if (mb) mb.textContent = '🔊';
            }
            applyMusicVolumeLive();
        };

        var modeBtn = el('mc-music-mode-btn');
        var modeOptions = el('mc-music-mode-options');
        if (modeBtn && modeOptions) {
            modeBtn.onclick = function () { modeOptions.hidden = !modeOptions.hidden; };
            modeOptions.querySelectorAll('button').forEach(function (btn) {
                btn.onclick = function () {
                    _musicMode = btn.getAttribute('data-mode');
                    var labels = { random: '🔀 التشغيل العشوائي', shailat: '🎙️ شيلات', khaleeji: '🎵 اغاني خليجية', iraqi: '🎼 اغاني عراقية' };
                    modeBtn.textContent = labels[_musicMode] || labels.random;
                    modeOptions.querySelectorAll('button').forEach(function (b) { b.classList.remove('mc-mode-active'); });
                    btn.classList.add('mc-mode-active');
                    modeOptions.hidden = true;
                };
            });
        }

        document.addEventListener('click', function (e) {
            if (modeOptions && !modeOptions.hidden && modeBtn && !modeBtn.contains(e.target) && !modeOptions.contains(e.target)) {
                modeOptions.hidden = true;
            }
        });
    }

    function updateBadges() {
        var chairsNum = el('mc-chairs-badge-num');
        var playersNum = el('mc-players-badge-num');
        if (chairsNum) chairsNum.textContent = _chairs.length;
        if (playersNum) playersNum.textContent = _alive.length;
    }

    /* ======================================================================
     *  5) رسم الكراسي واللاعبين على الحلبة
     * ==================================================================== */
    function angleToXY(angleDeg, radiusPct) {
        var rad = (angleDeg - 90) * Math.PI / 180;
        return { x: 50 + radiusPct * Math.cos(rad), y: 50 + radiusPct * Math.sin(rad) };
    }

    // ⚠️ استبدلنا رسم الـSVG المسطّح بصورة كرسي واقعية حقيقية (chair.png،
    // زوَّدنا بها صاحب المشروع، مقصوصة الخلفية شفافة) — بطلب صريح لشكل
    // أكثر واقعية. lazy-load + alt فاضي (زخرفي بحت، ما يحمل معنى إضافي).
    function chairSvg() {
        return '<img class="mc-chair-svg" src="images/chair.png" alt="" loading="lazy">';
    }

    function avatarInnerHtml(player) {
        var name = playerLabel(player);
        var avatarUrl = player && player.avatarUrl;
        var initials = (name || '').trim().slice(0, 2).toUpperCase() || '؟';
        return (avatarUrl
            ? '<img class="mc-avatar-img" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" ' +
              'onerror="this.outerHTML=\'<div class=&quot;mc-avatar-fallback&quot;>' + escapeHtml(initials) + '</div>\';">'
            : '<div class="mc-avatar-fallback">' + escapeHtml(initials) + '</div>') +
            '<span class="mc-avatar-name">' + escapeHtml(name) + '</span>';
    }

    function usedChairNumbers() {
        var used = {};
        _chairs.forEach(function (c) { used[c.number] = true; });
        return used;
    }

    function randomFreeChairNumber(used) {
        var num;
        do { num = 10 + Math.floor(Math.random() * 90); } while (used[num]);
        used[num] = true;
        return num;
    }

    function buildChairs(count) {
        var used = {};
        var chairs = [];
        for (var i = 0; i < count; i++) {
            var pos = angleToXY((360 / count) * i, 32);
            chairs.push({ number: randomFreeChairNumber(used), x: pos.x, y: pos.y, occupantId: null });
        }
        return chairs;
    }

    function renderChairsRing() {
        var ring = el('mc-chairs-ring');
        if (!ring) return;
        ring.innerHTML = _chairs.map(function (chair, idx) {
            return '<div class="mc-chair" id="mc-chair-' + idx + '" style="left:' + chair.x + '%;top:' + chair.y + '%;">' +
                chairSvg() + '<span class="mc-chair-number">' + chair.number + '</span></div>';
        }).join('');
    }

    // ⚠️ جديد: لاعب جديد ينضم أثناء دورة شغّالة ← يزيد عدد الكراسي تلقائياً
    // (نفس منطق حساب عدد الكراسي بالدورة، بس مطبَّق على العدد الجديد للأحياء)
    // بدون ما نلمس مواقع/أرقام الكراسي الموجودة أصلاً (نضيف بس الكرسي
    // الناقص كعنصر جديد، حتى ما نحرّك كرسي لاعب قاعد عليه فعلاً).
    function addChairsIfNeeded() {
        if (!_matchActive || _chairs.length === 0) return;
        var mode = liveSettings().chairDeficitMode || 'auto';
        var targetCount = (mode === 'custom')
            ? Math.max(1, _alive.length - _roundDeficit)
            : Math.max(1, _alive.length - 1);

        if (targetCount <= _chairs.length) return;

        var used = usedChairNumbers();
        var newTotal = targetCount;
        var ring = el('mc-chairs-ring');
        var showRevealed = _selectionOpen; // لو الاختيار شغّال أصلاً، الكرسي الجديد يطلع مكشوف فوراً

        while (_chairs.length < newTotal) {
            var idx = _chairs.length;
            var pos = angleToXY((360 / newTotal) * idx, 32);
            var chair = { number: randomFreeChairNumber(used), x: pos.x, y: pos.y, occupantId: null };
            _chairs.push(chair);

            if (ring) {
                var div = document.createElement('div');
                div.className = 'mc-chair' + (showRevealed ? ' mc-chair-revealed' : '');
                div.id = 'mc-chair-' + idx;
                div.style.left = chair.x + '%';
                div.style.top = chair.y + '%';
                div.innerHTML = chairSvg() + '<span class="mc-chair-number">' + chair.number + '</span>';
                ring.appendChild(div);
            }
        }
        updateBadges();
    }

    function playerBaseAngle(index, total) { return (360 / total) * index; }

    function renderPlayersRing() {
        var ring = el('mc-players-ring');
        if (!ring) return;
        ring.innerHTML = _alive.map(function (p, idx) {
            var angle = playerBaseAngle(idx, _alive.length);
            _playerAngle[p.id] = angle;
            var pos = angleToXY(angle, 46);
            return '<div class="mc-avatar" id="mc-avatar-' + escapeHtml(p.id) + '" data-player-id="' + escapeHtml(p.id) + '" ' +
                'style="left:' + pos.x + '%;top:' + pos.y + '%;">' + avatarInnerHtml(p) + '</div>';
        }).join('');
    }

    /* ======================================================================
     *  6) الدوران
     * ==================================================================== */
    function startRingLoop() {
        stopRingLoop();
        _ringSpinning = true;
        _ringTimer = setInterval(function () {
            _ringRotation = (_ringRotation + ROTATION_DEG_PER_SEC * (RING_TICK_MS / 1000)) % 360;
            _alive.forEach(function (p, idx) {
                if (_seatedThisRound[p.id]) return;
                var base = playerBaseAngle(idx, _alive.length);
                var angle = (base + _ringRotation) % 360;
                _playerAngle[p.id] = angle;
                var pos = angleToXY(angle, 46);
                var elAvatar = el('mc-avatar-' + p.id);
                if (elAvatar) { elAvatar.style.left = pos.x + '%'; elAvatar.style.top = pos.y + '%'; }
            });
        }, RING_TICK_MS);
    }

    function stopRingLoop() {
        _ringSpinning = false;
        if (_ringTimer) { clearInterval(_ringTimer); _ringTimer = null; }
    }

    /* ======================================================================
     *  6ب) زر التدوير اليدوي — مدة طبيعية 12 ثانية + إمكانية إيقاف مبكر يدوي
     * ==================================================================== */
    function handleSpinButtonClick() {
        if (_spinState === 'idle') startSpinPhase();
        else if (_spinState === 'spinning') stopSpinAndReveal(); // إيقاف مبكر يدوي
    }

    function startSpinPhase() {
        _spinState = 'spinning';
        var btn = el('mc-spin-btn');
        if (btn) { btn.textContent = '⏸️ إيقاف'; btn.classList.add('mc-spin-btn-active'); }

        renderRoundBanner('spinning');
        startRingLoop();
        startMusic();

        // ⚠️ مدة الدوران صارت قابلة للتحكم من إعدادات المباراة (بدل ثابت
        // 12 ثانية) — بحد أقصى 35 ثانية مضمون (المُدخل الأقصى بالإعدادات
        // نفسها 35 أصلاً، بس نضمنها هنا برضو احتياطاً).
        var seconds = Math.min(SPIN_DURATION_MAX_S, liveSettings().spinDurationSeconds || 15);
        _spinTimeoutId = window.setTimeout(stopSpinAndReveal, seconds * 1000);
    }

    /* ======================================================================
     *  7) الاستماع لشات البث
     * ==================================================================== */
    function wireCommentListener() {
        unwireCommentListener();
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_selectionOpen || !payload || typeof payload.text !== 'string') return;
            var player = findAlivePlayer(payload.id, payload.name);
            if (!player) return;
            if (_seatedThisRound[player.id]) return;
            var n = parseInt(payload.text.trim(), 10);
            if (isNaN(n)) return;
            var chairIdx = _chairs.findIndex(function (c) { return c.number === n && !c.occupantId; });
            if (chairIdx === -1) return;
            claimChair(player, chairIdx);
        });
    }

    function unwireCommentListener() {
        if (typeof _commentUnsub === 'function') _commentUnsub();
        _commentUnsub = null;
    }

    function findAlivePlayer(id, name) {
        for (var i = 0; i < _alive.length; i++) {
            var p = _alive[i];
            if ((id && p.id === id) || (name && p.name === name)) return p;
        }
        return null;
    }

    function claimChair(player, chairIdx) {
        var chair = _chairs[chairIdx];
        chair.occupantId = player.id;
        _seatedThisRound[player.id] = true;

        var chairEl = el('mc-chair-' + chairIdx);
        if (chairEl) chairEl.classList.add('mc-chair-taken');

        var avatarEl = el('mc-avatar-' + player.id);
        if (avatarEl) {
            avatarEl.classList.add('mc-avatar-seating');
            avatarEl.style.left = chair.x + '%';
            avatarEl.style.top = chair.y + '%';
            window.setTimeout(function () { avatarEl.classList.add('mc-avatar-safe'); }, 480);
        }

        playSound('claim');

        // ⚠️ إصلاح باگ حقيقي: الشرط القديم كان يتحقق فقط لو "كل اللاعبين
        // الأحياء" لقوا كراسي — شي يكاد يستحيل يصير لأن الكراسي دايماً
        // أقل من اللاعبين بالتصميم (فيه عجز دايماً ≥1)، فكان العدّاد
        // يكمل لآخر وقته دايماً حتى لو خلصت كل الكراسي الفاضية من زمان.
        // الصح: أول ما تنحجز آخر كرسي فاضي (بغض النظر عن عدد اللاعبين
        // المتبقين بدون كرسي)، تنتهي الدورة فوراً وتبدأ الإقصاء مباشرة.
        var chairsStillEmpty = _chairs.filter(function (c) { return !c.occupantId; }).length;
        if (chairsStillEmpty === 0) {
            AGP.timerManager.stop(TIMER_NAME);
            window.setTimeout(finishSelectionWindow, 500);
        }
    }

    /* ======================================================================
     *  8) دورة كاملة
     * ==================================================================== */
    function computeChairCount() {
        var mode = liveSettings().chairDeficitMode || 'auto';
        var aliveCount = _alive.length;
        if (mode === 'custom') {
            var deficit = _customDeficitCurrent;
            _roundDeficit = deficit; // ⚠️ نحفظ العجز المستخدَم فعلياً بهذي الدورة (يلزم addChairsIfNeeded)
            var count = Math.max(1, aliveCount - deficit);
            _customDeficitCurrent = Math.max(1, deficit - 1);
            return count;
        }
        _roundDeficit = 1;
        return Math.max(1, aliveCount - 1);
    }

    // ⚠️ تعديل جوهري: ما تبدأ الدوران تلقائياً بعد الآن — فقط تجهّز الحلبة
    // (كراسي + لاعبون بوضع ثابت) وتفعّل زر "تدوير" وتنتظر ضغطة الاستريمر.
    function runNextRound() {
        if (!_matchActive) return;
        if (_alive.length <= 1) { endMatch(_alive[0] || null); return; }

        _roundNumber++;
        _seatedThisRound = {};
        var chairCount = computeChairCount();
        _chairs = buildChairs(chairCount);

        renderRoundBanner('ready');
        renderChairsRing();
        renderPlayersRing();
        updateBadges();
        el('mc-countdown').textContent = '';
        el('mc-countdown').className = '';
        el('mc-spin-countdown').textContent = '';

        _spinState = 'idle';
        var btn = el('mc-spin-btn');
        if (btn) { btn.disabled = false; btn.textContent = '▶️ تدوير'; btn.classList.remove('mc-spin-btn-active'); }
    }

    function renderRoundBanner(phase) {
        var numEl = el('mc-round-num');
        var subEl = el('mc-round-sub');
        if (!numEl || !subEl) return;
        numEl.textContent = 'الدورة ' + _roundNumber;
        if (phase === 'ready') subEl.textContent = '🎯 اضغط "تدوير" وقت ما تجهز';
        else if (phase === 'spinning') subEl.textContent = '🎶 الموسيقى شغّالة... استعدوا!';
        else if (phase === 'selecting') subEl.textContent = 'اكتبوا رقم الكرسي بالشات';
        else if (phase === 'eliminating') subEl.textContent = 'جارِ الإقصاء...';
    }

    function stopSpinAndReveal() {
        if (_spinTimeoutId) { clearTimeout(_spinTimeoutId); _spinTimeoutId = null; }
        stopRingLoop();
        stopMusic(); // ⚠️ الصوت يتوقف فوراً لحظة توقف الكراسي — طلب صريح

        _spinState = 'idle';
        var btn = el('mc-spin-btn');
        if (btn) { btn.disabled = true; btn.textContent = '▶️ تدوير'; btn.classList.remove('mc-spin-btn-active'); }

        _chairs.forEach(function (c, idx) {
            var chairEl = el('mc-chair-' + idx);
            if (chairEl) chairEl.classList.add('mc-chair-revealed');
        });
        playSound('reveal');

        var settings = liveSettings();
        var seconds = settings.selectionTimerSeconds || 15;
        renderRoundBanner('selecting');

        _selectionOpen = true;
        wireCommentListener();
        wireTimerListeners();
        AGP.timerManager.start(TIMER_NAME, seconds);
    }

    function wireTimerListeners() {
        unwireTimerListeners();
        _timerTickUnsub = AGP.events.on('timer:tick', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            var cd = el('mc-countdown');
            var spinCd = el('mc-spin-countdown'); // ⚠️ نفس العدّاد يظهر بجانب زر التدوير أيضاً — طلب صريح
            if (cd) cd.textContent = '⏱️ ' + payload.remainingSeconds + ' ثانية';
            if (spinCd) spinCd.textContent = '⏱️ ' + payload.remainingSeconds;
            if (payload.remainingSeconds <= 5 && payload.remainingSeconds > 0) {
                if (cd) cd.classList.add('mc-countdown-warn');
                playSound('warning');
            }
        });
        _timerEndedUnsub = AGP.events.on('timer:ended', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            finishSelectionWindow();
        });
    }

    function unwireTimerListeners() {
        if (typeof _timerTickUnsub === 'function') _timerTickUnsub();
        if (typeof _timerEndedUnsub === 'function') _timerEndedUnsub();
        _timerTickUnsub = null;
        _timerEndedUnsub = null;
    }

    function finishSelectionWindow() {
        if (!_selectionOpen) return;
        _selectionOpen = false;
        unwireCommentListener();
        unwireTimerListeners();
        el('mc-countdown').textContent = '';
        el('mc-spin-countdown').textContent = '';

        var losers = _alive.filter(function (p) { return !_seatedThisRound[p.id]; });
        renderRoundBanner('eliminating');

        if (losers.length === 0) {
            window.setTimeout(runNextRound, NEXT_ROUND_DELAY_MS);
            return;
        }
        eliminateSequentially(losers, 0);
    }

    /* ======================================================================
     *  9) الإقصاء بأنيميشن متتابع
     * ==================================================================== */
    /* ======================================================================
     *  9ب) تبويب المُقصَين — يظهر بكل الأسماء والصور المُقصاة هالدورة
     *      مرة وحدة، ويبقى ظاهر **لين الاستريمر يقفله بنفسه** بزر ✕ —
     *      ما يختفي تلقائياً بأي توقيت. الدورة الجاية ما تبدأ تجهيزها
     *      إلا بعد ما يُقفل التبويب يدوياً (طلب صريح).
     * ==================================================================== */
    function showEliminatedPanel(losers) {
        var panel = el('mc-eliminated-panel');
        if (!panel) return;
        panel.innerHTML = '<button type="button" class="mc-eliminated-close-btn" id="mc-eliminated-close-btn" title="إغلاق">✕</button>' +
            '<img class="mc-eliminated-logo" src="../../logo.png" alt="">' +
            '<div class="mc-eliminated-title">❌ تم إقصاء هالدورة</div>' +
            '<div class="mc-eliminated-avatars" id="mc-eliminated-avatars"></div>';
        var wrap = el('mc-eliminated-avatars');
        losers.forEach(function (player) {
            var div = document.createElement('div');
            div.className = 'mc-eliminated-avatar-item';
            div.id = 'mc-elim-item-' + player.id;
            div.innerHTML = avatarInnerHtml(player);
            wrap.appendChild(div);
        });
        panel.classList.add('mc-eliminated-visible');

        document.getElementById('mc-eliminated-close-btn').onclick = function () {
            panel.classList.remove('mc-eliminated-visible');
            proceedAfterElimination();
        };
    }

    function proceedAfterElimination() {
        updateBadges();
        if (_alive.length <= 1) endMatch(_alive[0] || null);
        else window.setTimeout(runNextRound, NEXT_ROUND_DELAY_MS - 700);
    }

    function eliminateSequentially(losers, idx) {
        if (idx === 0) showEliminatedPanel(losers); // ⚠️ الكل يظهر دفعة وحدة من البداية، مو تراكمياً

        if (idx >= losers.length) {
            // ⚠️ ما نكمل تلقائياً هنا إطلاقاً — ننتظر ضغطة زر ✕ اليدوية
            // (داخل showEliminatedPanel) اللي تستدعي proceedAfterElimination.
            return;
        }
        var player = losers[idx];
        var avatarEl = el('mc-avatar-' + player.id);
        if (avatarEl) avatarEl.classList.add('mc-avatar-out');
        playSound('eliminate');

        window.setTimeout(function () {
            if (avatarEl) avatarEl.remove();
            var aliveIdx = _alive.findIndex(function (p) { return p.id === player.id; });
            if (aliveIdx !== -1) _alive.splice(aliveIdx, 1);
            _eliminated.push({ player: player, round: _roundNumber });
            eliminateSequentially(losers, idx + 1);
        }, ELIMINATE_STAGGER_MS);
    }

    /* ======================================================================
     *  10) حذف/انضمام لاعب أثناء المباراة
     * ==================================================================== */
    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id) return;
        var aliveIdx = _alive.findIndex(function (p) { return p.id === removedPlayer.id; });
        if (aliveIdx !== -1) {
            _alive.splice(aliveIdx, 1);
            var avatarEl = el('mc-avatar-' + removedPlayer.id);
            if (avatarEl) avatarEl.remove();
            updateBadges();
            if (_matchActive && _alive.length <= 1) {
                window.setTimeout(function () { endMatch(_alive[0] || null); }, 400);
            }
        }
        var elimIdx = _eliminated.findIndex(function (e) { return e.player.id === removedPlayer.id; });
        if (elimIdx !== -1) _eliminated.splice(elimIdx, 1);
    }

    // ⚠️ تعديل: اللاعب الجديد يظهر بعجلة الكراسي فوراً وقت انضمامه (مو
    // بالدورة الجاية بس) — طلب صريح. نحسب له موقعه الحالي (يراعي دوران
    // الحلقة لو شغّالة وقتها) ونضيف عنصره للـDOM مباشرة بأنيميشن ظهور.
    function handlePlayerJoined(newPlayer) {
        if (!_matchActive || !newPlayer || !newPlayer.id) return;
        var already = _alive.some(function (p) { return p.id === newPlayer.id; }) ||
            _eliminated.some(function (e) { return e.player.id === newPlayer.id; });
        if (already) return;

        _alive.push(newPlayer);
        updateBadges();
        showToast('➕ ' + playerLabel(newPlayer) + ' انضم للمباراة');

        var ring = el('mc-players-ring');
        if (!ring) return;
        var idx = _alive.length - 1;
        var base = playerBaseAngle(idx, _alive.length);
        var angle = (base + (_ringSpinning ? _ringRotation : 0)) % 360;
        _playerAngle[newPlayer.id] = angle;
        var pos = angleToXY(angle, 46);

        var div = document.createElement('div');
        div.className = 'mc-avatar mc-avatar-joining';
        div.id = 'mc-avatar-' + newPlayer.id;
        div.setAttribute('data-player-id', newPlayer.id);
        div.style.left = pos.x + '%';
        div.style.top = pos.y + '%';
        div.innerHTML = avatarInnerHtml(newPlayer);
        ring.appendChild(div);

        addChairsIfNeeded(); // ⚠️ جديد: يزيد عدد الكراسي فوراً لو انضم لاعب أثناء دورة شغّالة
    }

    function enforceMaxPlayers() {
        var settings = liveSettings();
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
     *  11) بدء المباراة (onStartRound من الشل)
     * ==================================================================== */
    function handleStartRound(settingsValues) {
        resetMatchState();
        _settings = settingsValues;
        _alive = AGP.gameManager.getPlayers().slice();
        _customDeficitCurrent = settingsValues.customDeficitStart || 5;
        _startedAt = Date.now();
        _matchActive = true;

        ensureScaffolding();
        runNextRound();
    }

    /* ======================================================================
     *  12) نهاية المباراة + تقرير النقاط + شاشة الفائز (فيديو + بطاقة)
     * ==================================================================== */
    function endMatch(winner) {
        _matchActive = false;
        stopRingLoop();
        stopMusic();
        unwireCommentListener();
        unwireTimerListeners();
        AGP.timerManager.stop(TIMER_NAME);

        var durationMs = _startedAt ? (Date.now() - _startedAt) : 0;
        var pointsPromise = Promise.resolve(null);

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var allPlayers = AGP.gameManager.getPlayers();
            var participants = allPlayers.map(function (p) {
                return { tiktokUsername: tiktokUsernameFor(p), won: Boolean(winner) && p.id === winner.id };
            }).filter(function (p) { return p.tiktokUsername; });

            if (participants.length) {
                pointsPromise = window.AGPAuth.reportRoundCompletion(participants, durationMs).catch(function () { return null; });
            }
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });
        pointsPromise.then(function (pointsResult) { renderWinnerScreen(winner, pointsResult); });
    }

    function findAwardedFor(pointsResult, player) {
        if (!pointsResult || pointsResult.success !== true || !Array.isArray(pointsResult.awarded)) return null;
        var uname = tiktokUsernameFor(player);
        if (!uname) return null;
        return pointsResult.awarded.filter(function (a) { return a.tiktokUsername === uname; })[0] || null;
    }

    // ⚠️ فيديو الاحتفال (250×250، حدود بلون الفيديو #4d0008 + توهج نابض)
    // يشتغل مباشرة مع بطاقة الفائز بنفس الشاشة — طلب صريح.
    function winnerVideoHtml() {
        // ⚠️ onerror جديد: لو ملف الفيديو مو موجود على السيرفر (404) أو
        // فشل تحميله لأي سبب، نستبدل الصندوق برسالة واضحة بدل ما يطلع
        // فاضي بصمت (بالضبط الأعراض اللي وصفتها بالصورة الثانية — على
        // الأغلب لأن videos/winning-video.mp4 لسه ما انرفع فعلياً على
        // GitHub وقتها).
        return '<div class="mc-winner-video-wrap" id="mc-winner-video-wrap">' +
            '<video id="mc-winner-video" src="videos/winning-video.mp4" autoplay loop playsinline ' +
            'onerror="document.getElementById(&quot;mc-winner-video-wrap&quot;).innerHTML=' +
            '&quot;&lt;div class=\'mc-winner-video-fallback\'&gt;🎬&lt;/div&gt;&quot;;"></video>' +
            '<button type="button" class="mc-winner-video-unmute" id="mc-winner-video-unmute" hidden>🔇 اضغط للصوت</button>' +
            '</div>';
    }

    // ⚠️ إصلاح باگ حقيقي: لما تضغط "إعادة المباراة" الفيديو ما كان يتوقف
    // (كانت تختفي بصرياً بس عبر display:none، بدون إيقاف التشغيل فعلياً)
    // — فيتراكم صوته فوق الدورة الجديدة. الحل: إيقاف صريح للفيديو قبل أي
    // إجراء نهاية مباراة (سواء "مباراة جديدة" أو "إعادة المباراة").
    function stopWinnerVideo() {
        var video = el('mc-winner-video');
        if (!video) return;
        try { video.pause(); video.currentTime = 0; video.muted = true; } catch (e) {}
    }

    function wireWinnerVideo() {
        var video = el('mc-winner-video');
        var unmuteBtn = el('mc-winner-video-unmute');
        if (!video) return;
        var p = video.play();
        if (p && typeof p.catch === 'function') {
            p.catch(function () {
                // المتصفح منع التشغيل بالصوت — نجرب مكتوماً كبديل، ونعرض
                // زر صغير يفعّل الصوت بضغطة واحدة من الاستريمر.
                video.muted = true;
                video.play().catch(function () {});
                if (unmuteBtn) {
                    unmuteBtn.hidden = false;
                    unmuteBtn.onclick = function () { video.muted = false; unmuteBtn.hidden = true; };
                }
            });
        }
    }

    function renderWinnerScreen(winner, pointsResult) {
        playSound('winner');

        var box = document.getElementById('agp-shell-box');
        var overlay = document.getElementById('agp-shell-overlay');
        if (!box || !overlay) return;

        box.id = 'mc-winner-box';
        // ⚠️ إصلاح: كنت أرجّع box.id لـ"agp-shell-box" بعد الرسم مباشرة (تحت)،
        // فأي تنسيق CSS يستهدف #mc-winner-box ما كان يشتغل أبداً وقت
        // العرض الفعلي. الحل: كلاس ثابت يبقى، بدل الاعتماد على الآيدي
        // المؤقت وحده.
        box.className = 'mc-winner-screen';
        var awarded = winner ? findAwardedFor(pointsResult, winner) : null;

        // ⚠️ صار يستخدم البطاقة الرسمية المشتركة (AGP.playerCard.renderTrophyCard)
        // بدل بطاقة الكراسي الموسيقية المحلية القديمة — بطلب صريح، بدون
        // أي لمس أو تعديل على تصميمها بملف js/agp-player-card.js المشترك
        // نفسه، فقط استدعاء واجهتها العامة الجاهزة.
        var trophyHtml = '';
        if (winner) {
            var pointsHtml = awarded
                ? '<div class="agp-trophy-points">+' + awarded.points + ' نقطة 🎉</div>'
                : '';
            trophyHtml = AGP.playerCard.renderTrophyCard(winner, {
                kind: 'winner',
                showCrown: true,
                pointsHtml: pointsHtml
            });
        }

        box.innerHTML =
            '<h2>🏆 انتهت المباراة</h2>' +
            (winner ? winnerVideoHtml() : '') +
            (winner
                ? '<div class="mc-trophy-wrap">' + trophyHtml + '</div>'
                : '<p class="agp-shell-status" style="text-align:center;">ما فيه فائز واضح لهذي المباراة.</p>') +
            '<div class="mc-winner-actions">' +
            '<button class="agp-shell-btn-connect mc-winner-action-btn" id="mc-new-match-btn">🔄 مباراة جديدة</button>' +
            '<button class="agp-shell-btn-connect mc-winner-action-btn" id="mc-replay-same-btn">🔁 إعادة المباراة (نفس اللاعبين)</button>' +
            '</div>';

        box.id = 'agp-shell-box';
        overlay.style.display = 'flex';

        if (winner) wireWinnerVideo();
        document.getElementById('mc-new-match-btn').onclick = function () {
            stopWinnerVideo();
            window.location.reload();
        };
        // ⚠️ جديد: إعادة المباراة بنفس قائمة اللاعبين المسجَّلين أصلاً
        // (بدون رجوع لشاشة الاتصال/اللوبي — نفس فلسفة "إعادة اللعب بنفس
        // اللاعبين" الموجودة بروليت الإقصاء).
        document.getElementById('mc-replay-same-btn').onclick = function () {
            stopWinnerVideo(); // ⚠️ إصلاح: يمنع تراكم صوت الفيديو فوق الدورة الجديدة
            overlay.style.display = 'none';
            box.className = ''; // ⚠️ إصلاح: يمنع بقاء كلاس "mc-winner-screen" عالق لو فُتحت لوحة الإعدادات لاحقاً
            resetMatchState();
            _alive = AGP.gameManager.getPlayers().slice();
            _customDeficitCurrent = (liveSettings().customDeficitStart) || 5;
            _startedAt = Date.now();
            _matchActive = true;
            runNextRound();
        };
    }

    /* ======================================================================
     *  13) تسجيل اللعبة بالمنصة
     * ==================================================================== */
    function registerGame() {
        // ⚠️ إصلاح باگ حقيقي لقطته بالاختبار: كانت أنماط اللوبي (الشبكة،
        // أزرار الحذف، صف الأزرار...) ما تنحقن بالصفحة إلا بعد "بدء
        // الجولة" (عبر ensureScaffolding)، يعني ما تشتغل إطلاقاً وقت
        // الاستريمر لسه بشاشة اللوبي نفسها! لازم تنحقن من أول لحظة.
        injectStageStyles();

        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'elimination-games',
            onLoad: function () { AGP.log('Musical Chairs: onLoad.'); },
            onPlayerJoin: function () { enforceMaxPlayers(); },
            onRoundEnd: function () { AGP.log('Musical Chairs: onRoundEnd.'); },
            onDestroy: function () { resetMatchState(); AGP.log('Musical Chairs: onDestroy — match state cleared.'); }
        });

        if (!registered) { AGP.log('Musical Chairs: registration failed (already registered?).'); return; }

        AGP.gameManager.loadGame(GAME_ID);

        _playerRemovedUnsub = AGP.events.on('player:removed', function (payload) {
            handlePlayerRemoved(payload && payload.player);
        });
        _playerJoinedUnsub = AGP.events.on('player:joined', function (payload) {
            var p = payload && payload.player;
            if (p) handlePlayerJoined(p);
        });

        AGP.gameShell.init({
            gameId: GAME_ID,
            gameTitle: GAME_NAME,
            settingsTitle: 'إعدادات مباراة الكراسي الموسيقية',
            gameExplanation: 'تدور الأفاتارات حول حلقة الكراسي وقت ما تضغط "تدوير" (12 ثانية، أو توقفها يدوياً قبل ' +
                'لو تبي)، وفجأة تتوقف وتظهر أرقام على كل كرسي. كل لاعب يكتب رقم الكرسي اللي يبيه بالشات — أول وحد ' +
                'يكتب الرقم الصحيح يفوز فيه. أي لاعب ما يلقى كرسي يُقصى فوراً. عدد الكراسي ينقص كل دورة (تلقائي أو ' +
                'مخصّص حسب اختيار الاستريمر) لين يبقى لاعب واحد فقط — هو الفائز!',
            connectButtonLabel: 'اتصال بالبث وبدء الإعدادات',
            minPlayersToStart: 3,
            logoImage: '../../logo.png',
            homeUrl: '../../index.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
        });

        startShellOverlayWatcher();
    }

    /* ======================================================================
     *  14) تحسينات شاشة اللوبي + لوحة الإعدادات أثناء المباراة — كل هذا
     *      إضافي بحت (CSS override + DOM injection من ملفنا) بدون أي
     *      تعديل على js/agp-game-shell.js أو js/agp-player-card.js
     *      المشتركين (قرار صريح من صاحب المشروع، ثابت لكل الألعاب).
     *
     *      شاشات الشل تُعاد رسمها بالكامل (innerHTML) مع أي تحديث (لاعب
     *      جديد، تغيّر حالة الاتصال...)، فأي إضافة يدوية تُمسَح فوراً —
     *      لذا نراقب DOM بـMutationObserver واحد يغطي الحالتين، ونعيد
     *      تطبيق كل التحسينات تلقائياً كل مرة يتغيّر فيها.
     * ==================================================================== */
    function enhanceShellOverlay() {
        var box = document.getElementById('agp-shell-box');
        if (!box) return;

        if (box.classList.contains('agp-lobby-box')) {
            enhanceLobbyScreen(box);
        }
        if (document.getElementById('agp-settings-close-btn')) {
            enhanceMidMatchSettingsPanel(box);
        }
        // ⚠️ جديد: شاشة الإعدادات الأولى (قبل الاتصال بالبث) — نميّزها
        // بوجود #agp-connect-btn (ما يُرسَم إلا هنا بالضبط، راجع تعليق
        // الملف المشترك نفسه سطر 169).
        if (document.getElementById('agp-connect-btn')) {
            enhanceInitialConnectScreen(box);
        }
    }

    function startShellOverlayWatcher() {
        enhanceShellOverlay();
        var target = document.getElementById('agp-shell-overlay') || document.body;
        var observer = new MutationObserver(function () { enhanceShellOverlay(); });
        observer.observe(target, { childList: true, subtree: true });
        window.addEventListener('resize', debounce(enhanceShellOverlay, 200));
    }

    function debounce(fn, ms) {
        var t = null;
        return function () {
            if (t) clearTimeout(t);
            t = window.setTimeout(fn, ms);
        };
    }

    /* -------- 14أ) عنوان اللوبي بلونين -------- */
    function injectLobbyGameNameLabel() {
        var h2 = document.querySelector('#agp-shell-box h2');
        if (!h2 || h2.textContent.indexOf('اللوبي') === -1) return;
        if (h2.querySelector('.mc-lobby-game-tag')) return; // مُضافة أصلاً
        var tag = document.createElement('span');
        tag.className = 'mc-lobby-game-tag';
        tag.textContent = ' — ' + GAME_NAME;
        h2.appendChild(tag);
    }

    /* -------- 14ب) قائمة اللاعبين: شبكة 3 أعمدة + حذف + بطاقة عريضة + تصغير تلقائي -------- */
    // ⚠️ 4 أعمدة ثابتة (بدل 3 سابقاً، بطلب صريح) — العرض المرجعي للبطاقة
    // (247px) أعرض من عمود واحد بـ4 أعمدة (~194px)، فنفس نظام التصغير
    // التناسقي المبني أصلاً لتوافق الآيباد (راجع التعليق تحت) يشتغل هنا
    // تلقائياً بدون أي منطق إضافي: يصغّر كل المقاسات تناسبياً (~78%)
    // عشان تنضبط بالضبط بـ4 أعمدة بدل 3، بنفس الشكل والنسب.
    //
    // ⚠️ إصلاح توافق آيباد/الشاشات الضيقة: نظام "الحجم الثابت" (60px
    // أفاتار + 200px لوح) محسوب على عرض مرجعي 900px لصندوق اللوبي — بس
    // صندوق اللوبي نفسه بالملف المشترك عرضه الأقصى الفعلي min(900px,
    // 96vw)، فعلى آيباد بالوضع العمودي (~768-834px عرض شاشة) ينضغط
    // الصندوق لعرض أضيق من 900px، فيصير عرض العمود الواحد فعلياً أضيق
    // من مجموع (أفاتار+لوح) الثابت — تنكسر الشبكة. الحل: نقيس العرض
    // المتاح الحقيقي فعلياً (list.clientWidth، دقيق لأي جهاز/تكبير) ولو
    // أضيق من المرجع نصغّر كل المقاسات تناسبياً (بحد أدنى 65%) — يحافظ
    // على نفس النسب والتناسق بدون أي كسر بالشبكة على أي مقاس شاشة.
    function fitLobbyCardsToAvailableWidth(list) {
        if (!list.clientWidth) return 60 + 200 - 13; // بيئة بدون تصيير حقيقي — نرجع القيمة المرجعية كما هي
        var gap = 19;
        var colWidth = (list.clientWidth - 3 * gap) / 4; // 4 أعمدة = 3 فجوات بينها
        var refTotal = 60 + 200 - 13; // العرض المرجعي: أفاتار + لوح - تراكب
        var scale = 1;
        if (colWidth > 0 && colWidth < refTotal) {
            scale = Math.max(0.65, colWidth / refTotal);
        }
        list.style.setProperty('--mc-av', (60 * scale).toFixed(1) + 'px');
        list.style.setProperty('--mc-nw', (200 * scale).toFixed(1) + 'px');
        list.style.setProperty('--mc-nh', (60 * scale).toFixed(1) + 'px');
        list.style.setProperty('--mc-overlap', (13 * scale).toFixed(1) + 'px');
        list.style.setProperty('--mc-nf', (18 * scale).toFixed(1) + 'px');
        return refTotal * scale;
    }

    function enhanceLobbyList() {
        var list = document.getElementById('agp-lobby-list');
        if (!list) return;

        var targetWidth = fitLobbyCardsToAvailableWidth(list);

        var players = AGP.gameManager.getPlayers();
        var items = Array.prototype.slice.call(list.children);

        items.forEach(function (li, idx) {
            var player = players[idx];
            if (!player) return;

            // زر حذف (✕) — فوق لوح الاسم مباشرة (الزاوية العلوية)، يستدعي
            // نفس API الحذف الحقيقي (AGP.player.removePlayer) بدون أي
            // لمس للملف المشترك — فقط عبر واجهته العامة المُصدَّرة أصلاً.
            if (!li.querySelector('.mc-lobby-remove-btn')) {
                li.style.position = 'relative';
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'mc-lobby-remove-btn';
                btn.textContent = '✕';
                btn.title = 'حذف من اللوبي';
                btn.onclick = function () {
                    if (AGP.player && typeof AGP.player.removePlayer === 'function') {
                        AGP.player.removePlayer(player.id);
                    }
                };
                li.appendChild(btn);
            }

            applyNameSlideIfOverflow(li);
        });

        normalizeFramedCardWidths(list, targetWidth);
    }

    // ⚠️ سلايد للاسم الطويل بدل القصّ — نغلّف النص مرة وحدة بـ.mc-name-inner،
    // ونقيس هل فاض عن عرض اللوح الثابت؛ لو فاض نحسب مسافة الإزاحة
    // بالضبط (Custom Property) ونفعّل أنيميشن السلايد.
    function applyNameSlideIfOverflow(li) {
        var nameEl = li.querySelector('.agp-pcard-name-basic');
        if (!nameEl) return;
        var inner = nameEl.querySelector('.mc-name-inner');
        if (!inner) {
            var text = nameEl.textContent;
            nameEl.textContent = '';
            inner = document.createElement('span');
            inner.className = 'mc-name-inner';
            inner.textContent = text;
            nameEl.appendChild(inner);
        }
        if (!nameEl.clientWidth || !inner.scrollWidth) return; // بيئة بدون تصيير حقيقي (مثل بيئة الاختبار)
        var overflow = inner.scrollWidth - nameEl.clientWidth;
        if (overflow > 2) {
            nameEl.classList.add('mc-name-overflow');
            nameEl.style.setProperty('--mc-name-shift', (-(overflow + 6)) + 'px');
        } else {
            nameEl.classList.remove('mc-name-overflow');
        }
    }

    // ⚠️ بطاقة مؤطَّرة (Option A) — عرض هدف ثابت = نفس عرض البطاقة العادية
    // (avatar + لوح - تراكب، بعد أي تصغير تناسبي لآيباد/شاشة ضيقة)،
    // الارتفاع ناتج تلقائياً حسب نسبة كل إطار. الملف المشترك يحسب عرض
    // كل إطار بناءً على ارتفاع ثابت خاص فيه (CARD_HEIGHT_PX=72px)، فنقرأ
    // عرضه الطبيعي الفعلي (inline style) ونطبّق zoom لكل بطاقة على حدة
    // يوصلها بالضبط للعرض المستهدف — بدون أي لمس لملف
    // js/agp-player-card.js المشترك.
    function normalizeFramedCardWidths(list, targetWidth) {
        var tplCards = list.querySelectorAll('.agp-pcard-tpl');
        tplCards.forEach(function (card) {
            var nativeWidth = parseFloat(card.style.width);
            if (!nativeWidth) return;
            var zoom = targetWidth / nativeWidth;
            card.style.zoom = zoom;
        });
    }

    /* -------- 14ج) صف الأزرار السفلي (إعدادات / بدء الجولة / رجوع للمنصة) -------- */
    function ensureLobbyActionsRow(box) {
        if (document.getElementById('mc-lobby-actions-row')) return;
        var startBtn = document.getElementById('agp-start-round-btn');
        if (!startBtn) return;

        var row = document.createElement('div');
        row.id = 'mc-lobby-actions-row';
        row.className = 'mc-lobby-actions-row';

        var backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'mc-lobby-back-settings-btn';
        backBtn.textContent = '⚙️ العودة لاعدادات المباراة';
        backBtn.onclick = function () {
            if (window.confirm('بيلغي الاتصال الحالي بالبث ويقفل اللوبي — تبي تكمل؟')) {
                window.location.reload();
            }
        };

        var homeBtn = document.createElement('a');
        homeBtn.href = '../../index.html';
        homeBtn.className = 'mc-lobby-home-btn';
        homeBtn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';

        startBtn.classList.add('mc-lobby-start-btn'); // نفس العنصر، ننقله بس (بدون أي تكرار أو تعديل نصّه)

        row.appendChild(backBtn);
        row.appendChild(startBtn);
        row.appendChild(homeBtn);
        box.appendChild(row);
    }

    function enhanceLobbyScreen(box) {
        injectLobbyGameNameLabel();
        enhanceLobbyList();
        ensureLobbyActionsRow(box);
    }

    /* -------- 14د) لوحة الإعدادات أثناء المباراة: زر رجوع للمنصة -------- */
    function enhanceMidMatchSettingsPanel(box) {
        if (document.getElementById('mc-settings-home-btn')) return;
        var btn = document.createElement('a');
        btn.id = 'mc-settings-home-btn';
        btn.href = '../../index.html';
        btn.className = 'mc-settings-home-btn';
        btn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';
        box.appendChild(btn);
    }

    /* -------- 14هـ) شاشة الإعدادات الأولى (قبل الاتصال): زر رجوع للمنصة -------- */
    function enhanceInitialConnectScreen(box) {
        if (document.getElementById('mc-connect-home-btn')) return;
        var btn = document.createElement('a');
        btn.id = 'mc-connect-home-btn';
        btn.href = '../../index.html';
        btn.className = 'mc-settings-home-btn';
        btn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';
        box.appendChild(btn);
    }

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
