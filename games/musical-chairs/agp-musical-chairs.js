/**
 * AGP MUSICAL CHAIRS — "الكراسي الموسيقية" (لعبة أصلية داخل المنصة، بنمط
 * games/elimination-roulette، ملف Plugin مستقل بمنطق إقصاء خاص باللعبة).
 *
 * الآلية: كل دورة الاستريمر يضغط "تدوير" يدوياً (يتوقف تلقائياً بعد مدة
 * الإعداد، أو يدوياً بضغطة ثانية). وقت الدوران تشتغل موسيقى؛ لحظة التوقف
 * تظهر أرقام عشوائية على الكراسي وتبدأ مهلة اختيار (اللاعبون يكتبون رقم
 * الكرسي بالشات، أول رقم صحيح لكرسي فاضي يثبَّت فوراً). عند انتهاء
 * المهلة، كل لاعب بدون كرسي يُقصى. عدد الكراسي: "تلقائي" (لاعبين−1) أو
 * "مخصّص" (عجز يبدأ برقم محدد وينقص واحد كل دورة حتى يثبت عند 1).
 *
 * الاعتماديات (بنفس ترتيب index.html القياسي): js/agp-core.js …
 * js/agp-bootstrap.js، ثم js/agp-player-card.js، ثم js/agp-game-shell.js.
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
    // خطوط شاشة الإعدادات/اللوبي — نفس خطوط السلم والثعبان
    function ensureDesignFonts() {
        if (el('mc-design-fonts-link')) return;
        var sheet = document.createElement('link');
        sheet.id = 'mc-design-fonts-link';
        sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=Zain:wght@400;700;800&family=Noto+Kufi+Arabic:wght@400;500;600;700&family=Cairo:wght@600;700;800;900&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap';
        document.head.appendChild(sheet);
    }

    function injectStageStyles() {
        if (el('mc-stage-styles')) return;
        ensureDesignFonts();
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
            'margin:14px auto 8px;padding:12px 20px;width:min(94vw,850px);min-height:76px;box-sizing:border-box;',
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
            /* ⚠️ تحسين لمس للجوال/الآيباد: زر الكتم كان بلا مساحة لمس
             * حقيقية (بس حجم الأيقونة نفسها) — صار له مساحة لمس دنيا
             * مريحة (44×44px تقريباً حسب توصية Apple/Google لأزرار اللمس). */
            '.mc-icon-btn{border:none;background:none;color:#fff;font-size:1.2em;cursor:pointer;',
            'line-height:1;min-width:38px;min-height:38px;display:flex;align-items:center;justify-content:center;',
            'padding:4px;}',
            '#mc-volume-slider{width:80px;height:26px;accent-color:var(--mc-gold);cursor:pointer;}',

            '.mc-music-mode{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;}',
            '.mc-music-mode-label{font-size:0.68em;color:#d9c3ef;font-weight:700;white-space:nowrap;}',
            '.mc-music-mode-btn{border:none;border-radius:999px;padding:9px 16px;font-weight:800;font-size:0.85em;',
            'color:#fff;background:#141018;border:1px solid #3a3040;cursor:pointer;display:flex;align-items:center;gap:6px;}',
            /* ⚠️ تحسين لمس: عرض أدنى للقائمة نفسها (بدل تعتمد على المحتوى
             * بس)، وسقف أقصى + حماية من الفيض خارج حدود الشاشة الضيقة
             * (آيباد/جوال) عبر max-width محسوب من عرض الشاشة نفسها. */
            '.mc-music-mode-options{position:absolute;top:calc(100% + 4px);right:0;background:#1c1424;border:1px solid var(--mc-badge-stroke);',
            'border-radius:12px;padding:6px;display:flex;flex-direction:column;gap:4px;min-width:170px;',
            'max-width:min(240px,90vw);z-index:50;',
            'box-shadow:0 6px 18px rgba(0,0,0,0.5);}',
            '.mc-music-mode-options[hidden]{display:none;}',
            '.mc-music-mode-options button{border:none;background:none;color:#f3eefc;text-align:right;padding:11px 12px;',
            'min-height:40px;border-radius:8px;font-size:0.9em;cursor:pointer;font-family:Cairo,sans-serif;}',
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
            '.mc-eliminated-close-btn{position:absolute;top:14px;left:14px;width:42px;height:42px;',
            'border-radius:50%;background:rgba(255,255,255,0.12);border:2px solid #fff;color:#fff;',
            'font-size:1.2em;font-weight:900;cursor:pointer;display:flex;align-items:center;',
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
            /* ⚠️ مقاس الكرسي صُغِّر شوي (كان 65×100px، صار 55×85px عند
             * أقصى حجم للحلقة 600px) — بطلب صريح. + transition لموقعه
             * (left/top) عشان أي إعادة توزيع لاحقة (لو انضم لاعب جديد
             * أثناء الدورة وزاد عدد الكراسي) تصير بحركة ناعمة سلسة، مو
             * قفزة مفاجئة. */
            '.mc-chair{position:absolute;width:9.17%;height:14.17%;transform:translate(-50%,-50%);',
            'display:flex;align-items:center;justify-content:center;transition:left .3s ease,top .3s ease,opacity .4s ease,transform .4s ease;}',
            '.mc-chair-svg{width:100%;height:100%;object-fit:contain;',
            'filter:drop-shadow(0 0 8px rgba(255,176,32,0.55));transition:filter .25s;}',
            '.mc-chair.mc-chair-taken .mc-chair-svg{filter:drop-shadow(0 0 14px rgba(124,58,237,0.9));}',
            /* ⚠️ جديد: الكرسي يختفي بالكامل (فيد + تصغير خفيف) بعد ما
             * توصل صورة اللاعب فوقه — بطلب صريح. */
            '.mc-chair.mc-chair-vanish{opacity:0;transform:translate(-50%,-50%) scale(0.7);pointer-events:none;}',
            /* ⚠️ رقم الكرسي — صار عنصر مستقل (مو جوّا .mc-chair بعد الآن)
             * يتموضع شعاعياً بموقعه الخاص (badgeX/badgeY محسوبة بـJS حسب
             * زاوية كل كرسي وحلقته) بدل موضع ثابت "لفوق" — يمنع تراكب
             * رقم كرسي داخلي وراء كرسي خارجي نهائياً. كبّرته وخشّنت حدوده
             * أكثر عشان يبين واضح جداً بشاشات الجوال بالبث المباشر. */
            '.mc-chair-number{position:absolute;transform:translate(-50%,-50%) scale(0);',
            'background:#000;color:#fff;border:3px solid var(--mc-gold);',
            'font-weight:900;font-size:1.85em;border-radius:999px;padding:4px 15px;min-width:1.6em;text-align:center;',
            'box-shadow:0 0 14px rgba(0,0,0,0.9);transition:transform .35s cubic-bezier(.34,1.56,.64,1),left .3s ease,top .3s ease;',
            'z-index:3;-webkit-text-stroke:0.6px #fff;}',
            '.mc-chair-number.mc-chair-revealed{transform:translate(-50%,-50%) scale(1);}',
            /* ⚠️ إصلاح باگ حقيقي: الرقم كان يبقى ظاهر حتى بعد ما يحجزه
             * لاعب (بس تغيّر لون حدوده) — المفروض يختفي تماماً بمجرد ما
             * ينحجز الكرسي. scale(0) هنا يكسب على scale(1) من حالة
             * "مكشوف" (نفس درجة الأولوية، بس هذا القانون بعدها بالترتيب)
             * فيرجع يصغّر لصفر بنفس أنيميشن الظهور بس بالعكس. */
            '.mc-chair-number.mc-chair-taken{border-color:var(--agp-accent-2);',
            'transform:translate(-50%,-50%) scale(0) !important;}',

            /* ⚠️ صورة اللاعب صُغِّرت لـ8% (كانت 11%) — عشان لو قعد لاعب
             * على كرسي، أفاتاره ما يغطي كرسي مجاور. */
            '.mc-avatar{position:absolute;width:8%;height:8%;transform:translate(-50%,-50%);',
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

            /* لوحة الإعدادات أثناء المباراة — زر رجوع للمنصة + إكس أبرز */
            '.mc-settings-home-btn{display:flex;align-items:center;justify-content:center;gap:6px;',
            'width:100%;max-width:360px;height:44px;margin:18px auto 0;border-radius:10px;',
            'background:linear-gradient(90deg,var(--agp-accent-2),var(--agp-accent));color:#fff;',
            'font-weight:800;font-size:0.9em;text-decoration:none;font-family:Cairo,sans-serif;',
            'box-sizing:border-box;}',

            /* ==================================================================
             * شاشة الإعدادات الأولى + طبقة "جاري الاتصال" + اللوبي — منسوخة
             * من تنسيق السلم والثعبان (games/snakes-ladders) بنفس الـCSS،
             * بادئة mc- بدل sl-، بدون أي تعديل على الملفات المشتركة.
             * ==================================================================== */
            '#agp-shell-box.agp-lobby-box,#agp-shell-box.agp-lobby-box *,',
            '#mc-conn-layer,#mc-conn-layer *{font-family:"Zain",Cairo,sans-serif !important;}',
            '.agp-field-desc{font-size:11.5px !important;font-weight:400 !important;color:#8f88a3 !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;white-space:normal !important;text-align:right;}',
            '#agp-shell-overlay:has(#agp-shell-box.agp-lobby-box){padding:0 !important;',
            'overflow-y:auto !important;',
            'background:',
            'radial-gradient(60% 45% at 18% 8%,rgba(122,63,212,.22),transparent 70%),',
            'radial-gradient(50% 40% at 88% 40%,rgba(214,168,60,.14),transparent 72%),',
            'radial-gradient(55% 45% at 40% 104%,rgba(48,26,104,.26),transparent 74%),',
            'linear-gradient(180deg,#0d0a14 0%,#08060d 45%,#050508 100%) !important;}',
            '#agp-shell-box.agp-lobby-box{background:none !important;border:none !important;',
            'box-shadow:none !important;position:relative;overflow:hidden;}',
            '#agp-shell-box.agp-lobby-box{width:min(94vw,1310px) !important;',
            'max-width:min(94vw,1310px) !important;height:min(94vh,980px) !important;max-height:94vh !important;',
            'height:min(94dvh,980px) !important;max-height:94dvh !important;',
            'display:flex !important;flex-direction:column !important;overflow:hidden !important;}',
            '#agp-shell-box.agp-lobby-box > h2,',
            '#agp-shell-box.agp-lobby-box > .agp-join-hint,',
            '#agp-shell-box.agp-lobby-box > #agp-entrance-stage,',
            '#agp-shell-box.agp-lobby-box > #agp-entrance-settled-list{flex:0 0 auto !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{flex:1 1 auto !important;',
            'min-height:0 !important;overflow-y:auto !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{scrollbar-width:none !important;',
            '-ms-overflow-style:none !important;padding-top:12px !important;',
            'padding-bottom:calc(var(--mc-actions-h,62px) + 16px) !important;',
            'margin-bottom:calc(-1 * var(--mc-actions-h,62px)) !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list::-webkit-scrollbar{display:none !important;}',
            '#mc-lobby-watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
            'width:55%;max-width:420px;opacity:0.25;pointer-events:none;z-index:0;}',
            '#agp-shell-box.agp-lobby-box > *:not(#mc-lobby-watermark){position:relative;z-index:1;}',
            '#agp-shell-box.agp-lobby-box h2{text-shadow:none !important;letter-spacing:0 !important;',
            'font-family:"Cairo",sans-serif !important;font-weight:800 !important;font-size:44px !important;',
            'color:#fff !important;line-height:1.3 !important;margin:0 0 6px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint{display:flex !important;flex-wrap:wrap !important;',
            'justify-content:center !important;align-items:center !important;gap:56px !important;',
            'width:100% !important;margin-bottom:22px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint-text{display:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge{order:0;display:inline-flex !important;',
            'align-items:center !important;gap:14px !important;background:none !important;',
            'border:none !important;padding:0 !important;font-family:"Cairo",sans-serif !important;',
            'font-size:44px !important;font-weight:800 !important;line-height:1.2 !important;',
            'color:#E2C700 !important;box-shadow:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge::before{content:"للدخول اكتب في شات البث";',
            'font-family:"Cairo",sans-serif;font-size:22px;font-weight:700;color:#fff;white-space:nowrap;}',
            '#agp-shell-box.agp-lobby-box #agp-lobby-count{position:static !important;order:1 !important;}',
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge{display:inline-flex !important;',
            'align-items:center !important;justify-content:center !important;width:157px !important;',
            'height:52px !important;box-sizing:border-box !important;padding:0 !important;',
            'background:rgba(217,217,217,.1) !important;border:4px solid #000 !important;',
            'border-radius:26px !important;font-family:"Cairo",sans-serif !important;direction:ltr !important;',
            'font-size:28px !important;font-weight:800 !important;color:#fff !important;',
            'box-shadow:none !important;}',
            '@media (max-width:600px){',
            '#agp-shell-box.agp-lobby-box h2{font-size:26px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint{gap:12px 24px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge{font-size:30px !important;gap:10px !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge::before{font-size:16px;}',
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge{width:120px !important;height:44px !important;',
            'font-size:22px !important;border-width:3px !important;}}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{display:grid !important;',
            'grid-template-columns:repeat(auto-fill,217px) !important;column-gap:37px !important;',
            'row-gap:20px !important;justify-content:center !important;',
            'justify-items:center !important;align-items:end !important;align-content:start !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard{width:217px !important;height:57px !important;',
            'box-sizing:border-box !important;padding:0 3px 0 28px !important;gap:6px !important;',
            'border-radius:24px !important;background:rgba(217,217,217,.3) !important;',
            'border:2px solid #000 !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-avatar-basic{width:48px !important;height:48px !important;',
            'background:#D9D9D9 !important;border:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-name-basic{flex:1 1 auto !important;width:auto !important;',
            'min-width:0 !important;height:auto !important;margin:0 !important;padding:0 !important;',
            'font-size:20px !important;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'font-weight:700 !important;color:#fff !important;background:none !important;border:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-avatar-basic--fallback{font-size:15px !important;color:#3a2f4a !important;}',
            '#agp-shell-box.agp-lobby-box li:has(> .agp-pcard) .agp-player-remove-btn{',
            'top:50% !important;left:7px !important;right:auto !important;transform:translateY(-50%);',
            'width:16px !important;height:16px !important;font-size:9px !important;z-index:5;}',
            '#agp-shell-box.agp-lobby-box li:has(> .agp-pcard-tpl){width:217px !important;height:57px !important;',
            'overflow:visible !important;display:flex !important;',
            'flex-direction:row !important;align-items:center !important;justify-content:center !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-tpl{zoom:0.7282;flex-shrink:0 !important;}',
            '#agp-shell-box.agp-lobby-box li:has(> .agp-pcard-tpl) .agp-player-remove-btn{',
            'top:50% !important;left:7px !important;right:auto !important;transform:translateY(-50%);',
            'width:16px !important;height:16px !important;font-size:9px !important;z-index:5;}',
            '#agp-shell-box.agp-lobby-box .agp-player-remove-btn{',
            'background:rgba(224,115,111,.18) !important;border-color:rgba(224,115,111,.55) !important;',
            'color:#e0736f !important;}',
            '#agp-shell-box.agp-lobby-box .agp-player-remove-btn:hover{',
            'background:rgba(224,115,111,.3) !important;color:#ff9b96 !important;}',
            '#agp-shell-box.agp-lobby-box .mc-lobby-actions-row{flex:0 0 auto !important;',
            'display:flex;gap:14px;margin-top:14px;justify-content:center;',
            'flex-wrap:wrap;position:relative;z-index:3 !important;}',
            '.mc-lobby-actions-row > *{width:360px !important;height:48px !important;',
            'max-width:360px !important;flex:0 0 360px !important;box-sizing:border-box !important;',
            'display:flex !important;align-items:center !important;justify-content:center !important;',
            'padding:0 14px !important;margin:0 !important;}',
            '#agp-shell-box.agp-lobby-box .mc-lobby-actions-row #agp-start-round-btn{',
            'background:#7a3fd4 !important;color:#f3ecff !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;',
            'box-shadow:0 22px 46px -24px rgba(122,63,212,1) !important;transition:background .25s !important;}',
            '#agp-shell-box.agp-lobby-box .mc-lobby-actions-row #agp-start-round-btn:hover{',
            'background:#9a6cf0 !important;}',
            '.mc-back-to-platform-btn{display:block;margin:14px auto 0;padding:10px 22px;',
            'border-radius:999px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.08);',
            'color:#f3eefc;font-family:inherit;font-weight:800;font-size:0.9em;cursor:pointer;',
            'transition:background 0.15s;}',
            '.mc-back-to-platform-btn:hover{background:rgba(255,255,255,0.18);}',
            '#agp-shell-overlay:has(.mc-settings-initial-box){padding:0 !important;',
            'align-items:flex-start !important;justify-content:center !important;overflow-y:auto !important;',
            'background:',
            'radial-gradient(60% 45% at 18% 8%,rgba(122,63,212,.22),transparent 70%),',
            'radial-gradient(50% 40% at 88% 40%,rgba(70,40,150,.22),transparent 72%),',
            'radial-gradient(55% 45% at 40% 104%,rgba(48,26,104,.26),transparent 74%),',
            'linear-gradient(rgba(255,255,255,.028) 1px,transparent 1px),',
            'linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px),',
            'linear-gradient(180deg,#0d0a14 0%,#08060d 45%,#050508 100%) !important;',
            'background-size:auto,auto,auto,88px 88px,88px 88px,auto !important;}',
            '.mc-settings-initial-box{width:min(1040px,94vw) !important;',
            'max-width:min(1040px,94vw) !important;height:calc(100vh - 70px) !important;',
            'height:calc(100dvh - 70px) !important;',
            'max-height:calc(100vh - 70px) !important;max-height:calc(100dvh - 70px) !important;',
            'margin:70px 0 0 !important;overflow:visible !important;',
            'display:flex !important;flex-direction:column !important;align-items:center !important;',
            'column-count:auto !important;column-gap:0 !important;',
            'background:none !important;border:none !important;border-radius:0 !important;',
            'box-shadow:none !important;padding:16px 4px 0 !important;box-sizing:border-box !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '.mc-settings-initial-box *{font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '.mc-settings-initial-box > h2{flex:0 0 auto !important;margin:0 0 4px !important;',
            'max-width:none !important;width:100% !important;font-size:clamp(24px,3.6vw,40px) !important;',
            'font-weight:900 !important;line-height:1.4 !important;text-align:center !important;',
            'padding:0 !important;border-bottom:none !important;position:static;',
            'font-family:"Cairo",sans-serif !important;',
            'background:linear-gradient(90deg,#b28cf5,#f0cd6a,#d9a0f0,#b28cf5) !important;',
            'background-size:200% 100% !important;-webkit-background-clip:text !important;',
            'background-clip:text !important;-webkit-text-fill-color:transparent !important;',
            'animation:mc-settings-wave 9s linear infinite !important;}',
            '.mc-settings-initial-box > h2::after{content:none !important;}',
            '@keyframes mc-settings-wave{0%{background-position:0% 50%}100%{background-position:200% 50%}}',
            '.mc-settings-initial-box .agp-shell-btn-connect:disabled{opacity:.45 !important;',
            'cursor:not-allowed !important;transform:none !important;}',
            '.mc-settings-initial-box .mc-settings-scroll{position:relative;',
            'flex:1 1 auto;min-height:0;width:100%;margin-top:18px;}',
            '.mc-settings-initial-box .mc-settings-scroll-inner{box-sizing:border-box;',
            'height:100%;overflow-y:auto;display:flex;flex-direction:column;gap:16px;',
            'padding:0 2px 26px;scrollbar-width:none;}',
            '.mc-settings-initial-box .mc-settings-scroll-inner::-webkit-scrollbar{',
            'display:none;}',
            '.mc-settings-initial-box .mc-settings-fade{position:absolute;inset:auto 0 0;',
            'height:44px;background:linear-gradient(transparent,#08060d);pointer-events:none;}',
            '.mc-settings-initial-box .mc-settings-glowline{position:absolute;inset:auto 0 0;',
            'height:1px;background:linear-gradient(90deg,transparent,rgba(178,140,245,.55),transparent);',
            'pointer-events:none;}',
            '.mc-settings-initial-box .agp-shell-field,',
            '.mc-settings-initial-box .agp-shell-row{border-bottom:none !important;',
            'padding:2px 0 !important;max-width:none !important;margin:0 !important;display:flex !important;',
            'justify-content:space-between !important;align-items:center !important;width:100% !important;',
            'flex-wrap:wrap !important;gap:12px !important;}',
            '.mc-settings-initial-box .agp-shell-field{flex-direction:column !important;',
            'align-items:flex-start !important;}',
            '.mc-settings-initial-box .agp-shell-field label,',
            '.mc-settings-initial-box .agp-shell-row-label{font-size:16px !important;',
            'font-weight:600 !important;color:#f4f2fb !important;text-align:right !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;display:flex !important;',
            'flex-direction:column !important;align-items:flex-end !important;gap:3px !important;}',
            '.mc-settings-initial-box .agp-shell-field input[type=text]{',
            'max-width:none !important;width:100% !important;background:rgba(255,255,255,.04) !important;',
            'border:1px solid rgba(255,255,255,.14) !important;border-radius:999px !important;',
            'padding:13px 18px !important;font-size:15px !important;font-weight:400 !important;',
            'text-align:center !important;transition:border-color .25s !important;color:#f4f2fb !important;',
            'box-sizing:border-box !important;}',
            '.mc-settings-initial-box .agp-shell-field input[type=text]:focus,',
            '.mc-settings-initial-box .agp-shell-field input[type=text]:not(:placeholder-shown){',
            'border-color:rgba(178,140,245,.6) !important;outline:none !important;}',
            '.mc-settings-initial-box .agp-pill-group{gap:8px !important;padding:4px !important;',
            'border-radius:999px !important;',
            'background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02)) !important;',
            'border:1px solid rgba(255,255,255,.12) !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 3px 10px -6px rgba(0,0,0,.6) !important;}',
            '.mc-settings-initial-box .agp-pill-btn{background:transparent !important;',
            'border:none !important;color:#a79fbb !important;padding:10px 16px !important;',
            'border-radius:999px !important;font-size:13.5px !important;font-weight:600 !important;',
            'transition:.25s !important;white-space:nowrap;}',
            '.mc-settings-initial-box .agp-pill-btn.agp-pill-active{',
            'background:#7a3fd4 !important;color:#f3ecff !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.3) inset,0 4px 10px -4px rgba(122,63,212,.7) !important;}',
            '.mc-settings-initial-box .agp-shell-counter-row button{display:none !important;}',
            '.mc-settings-initial-box .agp-shell-counter-row{justify-content:flex-end !important;',
            'flex:1;max-width:220px;}',
            '.mc-settings-initial-box .agp-count-input{',
            'background:rgba(255,255,255,.04) !important;border:1px solid rgba(255,255,255,.14) !important;',
            'border-radius:999px !important;padding:13px 18px !important;width:100% !important;',
            'height:auto !important;color:#f4f2fb !important;font-size:15px !important;',
            'font-weight:400 !important;outline:none !important;text-align:center !important;',
            'box-sizing:border-box !important;}',
            '.mc-settings-initial-box .agp-count-input:focus{',
            'border-color:rgba(178,140,245,.55) !important;}',
            '.mc-settings-initial-box .mc-settings-card{width:100%;',
            'padding:16px 18px;border-radius:20px;border:1px solid rgba(255,255,255,.09);',
            'background:rgba(255,255,255,.03);box-sizing:border-box;display:flex;',
            'flex-direction:column;gap:12px;}',
            '.mc-settings-initial-box .mc-settings-card > .agp-shell-row,',
            '.mc-settings-initial-box .mc-settings-card > .agp-shell-field{padding:0 !important;}',
            '.mc-settings-initial-box .mc-conditional-section{display:flex !important;',
            'flex-direction:column !important;gap:14px !important;margin-top:4px !important;',
            'padding-top:16px !important;border-top:1px solid rgba(255,255,255,.07) !important;',
            'border-right:none !important;padding-right:0 !important;}',
            '.mc-settings-initial-box .mc-conditional-section .agp-shell-row{',
            'border-bottom:none !important;padding:0 !important;}',
            '.mc-settings-initial-box .mc-field-note{color:#8f88a3 !important;',
            'text-align:right !important;}',
            '.mc-settings-initial-box .mc-settings-footer{flex:0 0 auto !important;',
            'width:100% !important;display:flex !important;flex-wrap:wrap !important;',
            'align-items:center !important;justify-content:center !important;',
            'gap:clamp(16px,3vw,36px) !important;padding:20px 0 26px !important;}',
            '.mc-settings-initial-box .agp-shell-btn-connect{',
            'order:1;column-span:none !important;display:inline-flex !important;',
            'align-items:center !important;justify-content:center !important;width:auto !important;',
            'max-width:none !important;margin:0 !important;padding:16px 42px !important;',
            'background:#7a3fd4 !important;color:#f3ecff !important;font-weight:700 !important;',
            'font-size:clamp(15px,1.8vw,17px) !important;border-radius:999px !important;',
            'letter-spacing:0.4px;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.25) inset,0 22px 46px -24px rgba(122,63,212,1) !important;',
            'transition:background .25s,transform .25s !important;}',
            '.mc-settings-initial-box .agp-shell-btn-connect:hover{',
            'background:#9a6cf0 !important;transform:translateY(-2px);}',
            '.mc-settings-initial-box .mc-back-to-platform-btn{',
            'order:2;column-span:none !important;display:inline-flex !important;',
            'align-items:center !important;width:auto !important;margin:0 !important;padding:0 !important;',
            'border:none !important;background:transparent !important;font-size:14px !important;',
            'font-weight:400 !important;color:#a79fbb !important;transition:color .25s !important;}',
            '.mc-settings-initial-box .mc-back-to-platform-btn:hover{',
            'color:#d3bcff !important;background:transparent !important;}',
            '#agp-shell-box.agp-connecting-box,#agp-shell-box.agp-conn-error{visibility:hidden !important;}',
            '#mc-conn-layer{position:fixed;inset:0;z-index:100010;display:none;',
            'align-items:center;justify-content:center;}',
            '#mc-conn-layer.show{display:flex;}',
            '#mc-conn-layer .mc-conn-backdrop{position:absolute;inset:0;overflow:hidden;display:flex;justify-content:center;align-items:flex-start;',
            'filter:blur(6px) brightness(0.55);pointer-events:none;}',
            '#mc-conn-layer .mc-conn-backdrop > *{pointer-events:none !important;}',
            '#mc-conn-layer .mc-conn-modal{position:relative;z-index:1;width:min(360px,90vw);',
            'background:linear-gradient(180deg,rgba(30,24,52,.98),rgba(11,10,18,.99));',
            'border:1px solid rgba(178,140,245,.32);border-radius:24px;',
            'padding:32px 26px;text-align:center;box-shadow:0 40px 90px -46px rgba(0,0,0,1);',
            'font-family:"Noto Kufi Arabic",sans-serif;}',
            '#mc-conn-layer .mc-conn-modal.mc-conn-err{border-color:#ef4444;}',
            '#mc-conn-layer::before{content:"";position:absolute;inset:0;background:rgba(5,2,8,0.45);}',
            '#mc-conn-layer .mc-conn-spinner{width:52px;height:52px;margin:0 auto 18px;',
            'border-radius:50%;border:4px solid rgba(178,140,245,.25);border-top-color:#b28cf5;',
            'animation:mc-conn-spin 0.9s linear infinite;}',
            '@keyframes mc-conn-spin{to{transform:rotate(360deg);}}',
            '#mc-conn-layer .mc-conn-err-icon{width:42px;height:42px;margin:0 auto 18px;',
            'border-radius:50%;background:rgba(239,68,68,0.15);color:#ef4444;font-size:22px;',
            'font-weight:900;display:flex;align-items:center;justify-content:center;}',
            '#mc-conn-layer .mc-conn-title{margin:0 0 6px;font-size:16.5px;font-weight:700;color:#f4f2fb;}',
            '#mc-conn-layer .mc-conn-modal.mc-conn-err .mc-conn-title{color:#ef4444;}',
            '#mc-conn-layer .mc-conn-sub{margin:0;font-size:13px;color:#8f88a3;',
            'font-family:"IBM Plex Sans Arabic",sans-serif;}',
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
                '<div class="mc-music-mode">' +
                '<span class="mc-music-mode-label">مدة تشغيل الأغنية</span>' +
                '<button type="button" id="mc-spin-duration-btn" class="mc-music-mode-btn">⏱️ 15 ثانية</button>' +
                '<div class="mc-music-mode-options" id="mc-spin-duration-options" hidden>' +
                '<button type="button" data-secs="10">10 ثوانٍ</button>' +
                '<button type="button" data-secs="15">15 ثانية</button>' +
                '<button type="button" data-secs="20">20 ثانية</button>' +
                '<button type="button" data-secs="25">25 ثانية</button>' +
                '<button type="button" data-secs="30">30 ثانية</button>' +
                '<button type="button" data-secs="35">35 ثانية</button>' +
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

        // ⚠️ جديد: زر "مدة تشغيل الأغنية" — نفس أسلوب زر نوع الموسيقى
        // بالضبط (خيار يفتح قائمة). الاختيار يحدَّث حياً على نفس إعداد
        // spinDurationSeconds (نفس مصدر الحقيقة المستخدَم بشاشة الإعدادات
        // الأولى)، عبر AGP.gameShell.setSetting — بدون متغيّر مواز.
        var durBtn = el('mc-spin-duration-btn');
        var durOptions = el('mc-spin-duration-options');
        if (durBtn && durOptions) {
            var currentSecs = liveSettings().spinDurationSeconds || 15;
            durBtn.textContent = '⏱️ ' + currentSecs + ' ثانية';
            durOptions.querySelectorAll('button').forEach(function (b) {
                if (Number(b.getAttribute('data-secs')) === currentSecs) b.classList.add('mc-mode-active');
            });

            durBtn.onclick = function () { durOptions.hidden = !durOptions.hidden; };
            durOptions.querySelectorAll('button').forEach(function (btn) {
                btn.onclick = function () {
                    var secs = Number(btn.getAttribute('data-secs'));
                    if (AGP.gameShell.setSetting) AGP.gameShell.setSetting('spinDurationSeconds', secs);
                    durBtn.textContent = '⏱️ ' + secs + ' ثانية';
                    durOptions.querySelectorAll('button').forEach(function (b) { b.classList.remove('mc-mode-active'); });
                    btn.classList.add('mc-mode-active');
                    durOptions.hidden = true;
                };
            });
        }

        document.addEventListener('click', function (e) {
            if (modeOptions && !modeOptions.hidden && modeBtn && !modeBtn.contains(e.target) && !modeOptions.contains(e.target)) {
                modeOptions.hidden = true;
            }
            if (durOptions && !durOptions.hidden && durBtn && !durBtn.contains(e.target) && !durOptions.contains(e.target)) {
                durOptions.hidden = true;
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

    // ⚠️ نظام حلقات متعددة للكراسي — بطلب صريح: 18 كرسي كحد أقصى بالحلقة
    // الواحدة (بالترتيب)، ولو العدد أكبر تُفتح حلقة ثانية أصغر بالداخل
    // (وثالثة لو لزم، بدون حد أقصى نظري لعدد الحلقات). كل حلقة تالية
    // تنزاح زاوياً نص الفجوة عن اللي قبلها، حتى ما تترص كراسي حلقتين
    // فوق بعض بنفس الخط الشعاعي (يحافظ على وضوح رقم كل كرسي، ما يصير
    // كرسي وراء كرسي ثاني).
    var CHAIRS_PER_RING = 18;
    var CHAIR_OUTER_RADIUS = 32;   // % — نفس نصف القطر القديم (الحلقة الأولى/الخارجية)
    var CHAIR_RING_GAP = 9;        // % — المسافة بين كل حلقة والتالية لها

    function chairRingRadius(ringIdx) {
        return Math.max(11, CHAIR_OUTER_RADIUS - ringIdx * CHAIR_RING_GAP);
    }

    function chairPositionForIndex(idx, total) {
        var ringIdx = Math.floor(idx / CHAIRS_PER_RING);
        var idxInRing = idx % CHAIRS_PER_RING;
        var startOfRing = ringIdx * CHAIRS_PER_RING;
        var countInThisRing = Math.min(CHAIRS_PER_RING, total - startOfRing);
        var angle = (360 / countInThisRing) * idxInRing;
        angle += ringIdx * (180 / countInThisRing); // إزاحة نص الفجوة لكل حلقة تالية (تدريج/Stagger)
        var pos = angleToXY(angle, chairRingRadius(ringIdx));
        return { x: pos.x, y: pos.y, angle: angle, ring: ringIdx };
    }

    // ⚠️ موقع رقم الكرسي (شعاعي حسب الحلقة) — الحلقة الخارجية (0) يطلع
    // رقمها للخارج (بعيد عن المركز، تجاه الفراغ خارج الكراسي كلها)،
    // والحلقات الداخلية (1+) تطلع أرقامها للداخل (تجاه الفراغ الفاضي
    // بمنتصف الدائرة) — بطلب صريح، يمنع أي تراكب بين أرقام حلقتين
    // مختلفتين نهائياً (كل حلقة تستخدم الفراغ اللي جنبها بس).
    function chairBadgePosition(angleDeg, ringIdx, chairRadius) {
        var dirSign = ringIdx === 0 ? 1 : -1;
        var badgeRadius = Math.max(4, chairRadius + dirSign * 7);
        return angleToXY(angleDeg, badgeRadius);
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
            var pos = chairPositionForIndex(i, count);
            var radius = chairRingRadius(pos.ring);
            var badge = chairBadgePosition(pos.angle, pos.ring, radius);
            chairs.push({
                number: randomFreeChairNumber(used), x: pos.x, y: pos.y,
                badgeX: badge.x, badgeY: badge.y, occupantId: null
            });
        }
        return chairs;
    }

    function renderChairsRing() {
        var ring = el('mc-chairs-ring');
        if (!ring) return;
        ring.innerHTML = _chairs.map(function (chair, idx) {
            return '<div class="mc-chair" id="mc-chair-' + idx + '" style="left:' + chair.x + '%;top:' + chair.y + '%;">' +
                chairSvg() + '</div>' +
                '<span class="mc-chair-number" id="mc-chair-num-' + idx + '" style="left:' + chair.badgeX + '%;top:' + chair.badgeY + '%;">' +
                chair.number + '</span>';
        }).join('');
    }

    // ⚠️ جديد: لاعب جديد ينضم أثناء دورة شغّالة ← يزيد عدد الكراسي تلقائياً
    // (نفس منطق حساب عدد الكراسي بالدورة، بس مطبَّق على العدد الجديد للأحياء)
    // بدون ما نلمس مواقع/أرقام الكراسي الموجودة أصلاً (نضيف بس الكرسي
    // الناقص كعنصر جديد، حتى ما نحرّك كرسي لاعب قاعد عليه فعلاً).
    // ⚠️ إصلاح باگ حقيقي: كانت الدالة تضيف الكرسي الجديد فقط بموقع
    // محسوب على افتراض "لو التوزيع صار من جديد لكل الكراسي (القديمة
    // + الجديدة)"، بس الكراسي القديمة فعلياً ما كانت تتحرك من مكانها —
    // فتصادم/تراكم حقيقي بين كرسي جديد وكرسي قديم بنفس المكان تقريباً
    // (لأن صيغة حساب الزاوية للكرسي الجديد كانت تفترض عدد إجمالي مختلف
    // عن اللي استُخدم فعلياً وقت رسم الكراسي القديمة).
    //
    // الحل الصحيح: نعيد توزيع **كل** الكراسي (القديمة والجديدة سوا)
    // بالتساوي حسب العدد الجديد، ونحرّك عناصر DOM الموجودة فعلياً
    // لمواقعها الجديدة بسلاسة (عندها transition أصلاً) — بما فيها أي
    // لاعب قاعد فعلاً على كرسي، نحرّك أفاتاره معه لنفس الموقع الجديد
    // (تحريك بسيط وسلس، أفضل بكثير من تصادم الكراسي).
    function addChairsIfNeeded() {
        if (!_matchActive || _chairs.length === 0) return;
        var mode = liveSettings().chairDeficitMode || 'auto';
        var targetCount = (mode === 'custom')
            ? Math.max(1, _alive.length - _roundDeficit)
            : Math.max(1, _alive.length - 1);

        if (targetCount <= _chairs.length) return;

        var ring = el('mc-chairs-ring');
        var showRevealed = _selectionOpen;
        var used = usedChairNumbers();
        var newTotal = targetCount;
        var oldCount = _chairs.length;

        for (var idx = 0; idx < newTotal; idx++) {
            var pos = chairPositionForIndex(idx, newTotal);
            var radius = chairRingRadius(pos.ring);
            var badge = chairBadgePosition(pos.angle, pos.ring, radius);

            if (idx < oldCount) {
                // كرسي موجود أصلاً — نحدّث موقعه فقط (نفس الرقم وحالة
                // الإشغال كما هي، ما نغيّرهم إطلاقاً).
                var chair = _chairs[idx];
                chair.x = pos.x; chair.y = pos.y;
                chair.badgeX = badge.x; chair.badgeY = badge.y;

                var chairEl = el('mc-chair-' + idx);
                if (chairEl) { chairEl.style.left = chair.x + '%'; chairEl.style.top = chair.y + '%'; }
                var badgeElExisting = el('mc-chair-num-' + idx);
                if (badgeElExisting) { badgeElExisting.style.left = chair.badgeX + '%'; badgeElExisting.style.top = chair.badgeY + '%'; }

                // لو فيه لاعب قاعد فعلاً على هذا الكرسي، نحرّك أفاتاره معه
                if (chair.occupantId) {
                    var occupantAvatar = el('mc-avatar-' + chair.occupantId);
                    if (occupantAvatar) { occupantAvatar.style.left = chair.x + '%'; occupantAvatar.style.top = chair.y + '%'; }
                }
            } else {
                // كرسي جديد بالكامل
                var newChair = {
                    number: randomFreeChairNumber(used), x: pos.x, y: pos.y,
                    badgeX: badge.x, badgeY: badge.y, occupantId: null
                };
                _chairs.push(newChair);

                if (ring) {
                    var div = document.createElement('div');
                    div.className = 'mc-chair';
                    div.id = 'mc-chair-' + idx;
                    div.style.left = newChair.x + '%';
                    div.style.top = newChair.y + '%';
                    div.innerHTML = chairSvg();
                    ring.appendChild(div);

                    var badgeEl = document.createElement('span');
                    badgeEl.className = 'mc-chair-number' + (showRevealed ? ' mc-chair-revealed' : '');
                    badgeEl.id = 'mc-chair-num-' + idx;
                    badgeEl.style.left = newChair.badgeX + '%';
                    badgeEl.style.top = newChair.badgeY + '%';
                    badgeEl.textContent = newChair.number;
                    ring.appendChild(badgeEl);
                }
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
        var badgeElTaken = el('mc-chair-num-' + chairIdx);
        if (badgeElTaken) badgeElTaken.classList.add('mc-chair-taken');

        var avatarEl = el('mc-avatar-' + player.id);
        if (avatarEl) {
            avatarEl.classList.add('mc-avatar-seating');
            avatarEl.style.left = chair.x + '%';
            avatarEl.style.top = chair.y + '%';
            window.setTimeout(function () { avatarEl.classList.add('mc-avatar-safe'); }, 480);
        }

        // ⚠️ جديد: الكرسي نفسه يختفي بعد ما توصل صورة اللاعب فوقه (بطلب
        // صريح) — نفس توقيت وصول الأفاتار تقريباً (480ms، بعد أنيميشن
        // الجلوس)، عبر فيد سلس (opacity) بدل اختفاء مفاجئ.
        if (chairEl) {
            window.setTimeout(function () { chairEl.classList.add('mc-chair-vanish'); }, 480);
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
            var badgeEl = el('mc-chair-num-' + idx);
            if (badgeEl) badgeEl.classList.add('mc-chair-revealed');
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

    // تبويب المُقصَين -- يظهر بكل الأسماء دفعة وحدة، ويبقى ظاهر لين
    // الاستريمر يقفله بنفسه بزر ✕. الدورة الجاية ما تبدأ إلا بعدها.
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
                ? '<div class="agp-trophy-points">+' + awarded.added + ' نقطة 🎉</div>'
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
            homeUrl: '../../games.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
        });

        startShellOverlayWatcher();
    }

    /* ======================================================================
     *  14) شاشة الإعدادات الأولى + اللوبي + طبقة "جاري الاتصال" — نفس
     *      تنسيق السلم والثعبان بالضبط (MutationObserver على
     *      #agp-shell-overlay)، بدون أي تعديل على js/agp-game-shell.js.
     * ==================================================================== */
    function homeNavigate() {
        var homeBtn = el('agp-header-home-btn');
        if (homeBtn) { homeBtn.click(); }
        else { window.location.href = '../../games.html'; }
    }

    function makeBackToPlatformBtn() {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mc-back-to-platform-btn';
        btn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';
        btn.addEventListener('click', homeNavigate);
        return btn;
    }

    function layoutInitialSettingsFields(box) {
        var connectBtn = el('agp-connect-btn');
        if (!connectBtn) return;
        if (connectBtn.closest('.mc-settings-footer')) return;

        function rowFor(dataKeySelector) {
            var ctl = box.querySelector(dataKeySelector);
            return ctl ? ctl.closest('.agp-shell-row') : null;
        }
        function cardWith(rows) {
            var card = document.createElement('div');
            card.className = 'mc-settings-card';
            rows.forEach(function (r) { card.appendChild(r); });
            return card;
        }

        var usernameInput = el('agp-tiktok-username');
        var usernameField = usernameInput ? usernameInput.closest('.agp-shell-field') : null;
        var keywordInput = el('agp-keyword');
        var keywordField = keywordInput ? keywordInput.closest('.agp-shell-field') : null;

        var maxPlayersRow = rowFor('[data-key="maxPlayers"]');
        var followersRow = rowFor('[data-key="followersOnly"]');
        var deficitModeRow = rowFor('[data-key="chairDeficitMode"]');
        var deficitStartRow = rowFor('[data-key="customDeficitStart"]');
        var selectionTimerRow = rowFor('[data-key="selectionTimerSeconds"]');
        var spinDurationRow = rowFor('[data-key="spinDurationSeconds"]');

        var scroll = document.createElement('div');
        scroll.className = 'mc-settings-scroll';
        var scrollInner = document.createElement('div');
        scrollInner.className = 'mc-settings-scroll-inner';
        scroll.appendChild(scrollInner);

        [usernameField, keywordField, maxPlayersRow, followersRow]
            .filter(Boolean).forEach(function (fieldEl) { scrollInner.appendChild(fieldEl); });

        // "كروت" — نفس كرت "عدد الفائزين" بالسلم والثعبان. عدد الكراسي
        // الناقصة (يظهر بس مع "مخصّص") داخل نفس كرت طريقة النقصان.
        if (deficitModeRow) {
            var deficitCard = cardWith([deficitModeRow]);
            if (deficitStartRow) {
                var cond = document.createElement('div');
                cond.className = 'mc-conditional-section';
                cond.appendChild(deficitStartRow);
                deficitCard.appendChild(cond);
            }
            scrollInner.appendChild(deficitCard);
        }
        [selectionTimerRow, spinDurationRow].filter(Boolean).forEach(function (row) {
            scrollInner.appendChild(cardWith([row]));
        });

        var fade = document.createElement('div');
        fade.className = 'mc-settings-fade';
        var glowline = document.createElement('div');
        glowline.className = 'mc-settings-glowline';
        scroll.appendChild(fade);
        scroll.appendChild(glowline);
        box.appendChild(scroll);

        var footer = document.createElement('div');
        footer.className = 'mc-settings-footer';
        footer.appendChild(connectBtn);
        box.appendChild(footer);
    }

    function enhanceSettingsScreen() {
        var box = el('agp-shell-box');
        if (!box) return;
        if (box.classList.contains('agp-lobby-box') || box.classList.contains('agp-connecting-box') ||
            el('agp-mini-lobby-list')) return;
        var isInitial = !!el('agp-tiktok-username');
        box.classList.toggle('mc-settings-initial-box', isInitial);
        if (!isInitial) return;
        layoutInitialSettingsFields(box);
        if (box.querySelector('.mc-back-to-platform-btn')) return;
        var connectBtn = el('agp-connect-btn');
        if (!connectBtn) return;
        var backBtn = makeBackToPlatformBtn();
        backBtn.textContent = 'العودة للمنصة ←';
        connectBtn.insertAdjacentElement('afterend', backBtn);
    }

    function enhanceLobbyHeading() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        var h2 = box.querySelector('h2');
        if (!h2) return;
        if (h2.getAttribute('data-mc-heading') !== '1') {
            h2.textContent = 'لوبي الدخول للعبة "' + GAME_NAME + '"';
            h2.setAttribute('data-mc-heading', '1');
        }
    }

    // Framed lobby cards, shown whole: the shared renderer draws every
    // framed card 298x100 and crops tall frame artwork to that height.
    // For each framed card this measures the frame image's opaque (alpha)
    // rows once per image, re-expands the card to cover the full artwork
    // plus the avatar/name, then zooms it to fit the 217px-wide slot, at
    // most 75px tall. DOM/style-only — js/agp-player-card.js untouched.
    var FRAMED_SLOT_W = 217;
    var FRAMED_SLOT_MAX_H = 75;
    var _mcFrameBoundsCache = {};

    function getFrameOpaqueRows(src) {
        if (_mcFrameBoundsCache[src]) return _mcFrameBoundsCache[src];
        _mcFrameBoundsCache[src] = new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
                try {
                    var w = Math.min(img.naturalWidth, 300);
                    var h = Math.max(1, Math.round(img.naturalHeight * w / img.naturalWidth));
                    var c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    var ctx = c.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    var data = ctx.getImageData(0, 0, w, h).data;
                    var top = -1, bottom = -1;
                    for (var y = 0; y < h && top < 0; y++) {
                        for (var x = 0; x < w; x++) { if (data[(y * w + x) * 4 + 3] > 16) { top = y; break; } }
                    }
                    for (var y2 = h - 1; y2 >= 0 && bottom < 0; y2--) {
                        for (var x2 = 0; x2 < w; x2++) { if (data[(y2 * w + x2) * 4 + 3] > 16) { bottom = y2 + 1; break; } }
                    }
                    resolve(top < 0 ? null : { top: top / h, bottom: bottom / h });
                } catch (e) { resolve(null); }
            };
            img.onerror = function () { resolve(null); };
            img.src = src;
        });
        return _mcFrameBoundsCache[src];
    }

    function enhanceLobbyFramedCards() {
        var box = el('agp-shell-box');
        if (!box || !(box.classList.contains('agp-lobby-box') || el('agp-mini-lobby-list'))) return;
        fitFramedCards(box);
    }

    function fitFramedCards(root) {
        var cards = root.querySelectorAll('.agp-shell-player-list .agp-pcard-tpl:not([data-mc-fit])');
        Array.prototype.forEach.call(cards, function (card) {
            var frameEl = card.querySelector('.agp-pcard-tpl-frame-img');
            var m = frameEl && /url\(["']?(.*?)["']?\)/.exec(frameEl.style.backgroundImage);
            if (!m) return;
            card.setAttribute('data-mc-fit', 'pending');
            getFrameOpaqueRows(m[1]).then(function (rows) {
                if (!rows || !card.isConnected) return;
                var frameTop = parseFloat(frameEl.style.top) || 0;
                var frameH = parseFloat(frameEl.style.height) || 0;
                var bandTop = frameTop + rows.top * frameH;
                var bandBottom = frameTop + rows.bottom * frameH;
                var children = card.querySelectorAll('.agp-pcard-tpl-avatar,.agp-pcard-tpl-name,.agp-pcard-tpl-frame-img');
                Array.prototype.forEach.call(children, function (child) {
                    if (child === frameEl) return;
                    var t = parseFloat(child.style.top) || 0;
                    var ch = parseFloat(child.style.height) || 0;
                    if (t < bandTop) bandTop = t;
                    if (t + ch > bandBottom) bandBottom = t + ch;
                });
                Array.prototype.forEach.call(children, function (child) {
                    child.style.top = ((parseFloat(child.style.top) || 0) - bandTop) + 'px';
                });
                var fullH = bandBottom - bandTop;
                var cardW = parseFloat(card.style.width) || 298;
                card.style.height = fullH + 'px';
                card.style.zoom = String(Math.min(FRAMED_SLOT_W / cardW, FRAMED_SLOT_MAX_H / fullH));
                card.setAttribute('data-mc-fit', '1');
            });
        });
    }

    function enhanceLobbyWatermarkAndActions() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;

        if (!box.querySelector('#mc-lobby-watermark')) {
            var img = document.createElement('img');
            img.id = 'mc-lobby-watermark';
            img.src = '../../logo.png';
            img.alt = '';
            box.insertBefore(img, box.firstChild);
        }

        var startBtn = el('agp-start-round-btn');
        if (!startBtn) return;
        if (startBtn.textContent.indexOf('اغلاق اللوبي') === -1) {
            startBtn.textContent = '🔒 اغلاق اللوبي وبدء المباراة';
        }

        var row = box.querySelector('.mc-lobby-actions-row');
        if (!row) {
            row = document.createElement('div');
            row.className = 'mc-lobby-actions-row';
            startBtn.parentNode.insertBefore(row, startBtn);
            row.appendChild(startBtn);
            var syncActionsHeight = function () {
                box.style.setProperty('--mc-actions-h',
                    (row.offsetHeight + (parseFloat(getComputedStyle(row).marginTop) || 0)) + 'px');
            };
            syncActionsHeight();
            if (window.ResizeObserver) new ResizeObserver(syncActionsHeight).observe(row);
        }

        if (!row.querySelector('.mc-back-to-platform-btn')) {
            var backBtn = document.createElement('button');
            backBtn.type = 'button';
            backBtn.className = 'mc-back-to-platform-btn';
            backBtn.textContent = '🏠 العودة لمكتبة الألعاب';
            backBtn.addEventListener('click', function () {
                window.location.href = '../../games.html';
            });
            row.appendChild(backBtn);
        }
    }

    function applyShellEnhancements() {
        enhanceSettingsScreen();
        enhanceLobbyHeading();
        enhanceLobbyWatermarkAndActions();
        enhanceLobbyFramedCards();
        if (document.getElementById('agp-settings-close-btn')) {
            enhanceMidMatchSettingsPanel(el('agp-shell-box'));
        }
    }

    /* -------- 14أ) طبقة "جاري الاتصال بالبث" — نفس السلم والثعبان -------- */
    var _mcConnLayer = null;
    var _mcConnKeywordBackup = '';
    var _mcConnKeywordPending = false;
    var _mcConnErrorShown = false;
    var _mcConnErrorTimer = null;

    function ensureConnLayer() {
        if (_mcConnLayer) return _mcConnLayer;
        var layer = document.createElement('div');
        layer.id = 'mc-conn-layer';
        layer.innerHTML =
            '<div class="mc-conn-backdrop"></div>' +
            '<div class="mc-conn-modal">' +
                '<div class="mc-conn-icon"></div>' +
                '<h3 class="mc-conn-title"></h3>' +
                '<p class="mc-conn-sub"></p>' +
            '</div>';
        document.body.appendChild(layer);
        _mcConnLayer = layer;
        return layer;
    }

    function showConnLayer(isError, title, sub) {
        var layer = ensureConnLayer();
        var modal = layer.querySelector('.mc-conn-modal');
        var icon = layer.querySelector('.mc-conn-icon');
        modal.classList.toggle('mc-conn-err', isError);
        icon.className = 'mc-conn-icon ' + (isError ? 'mc-conn-err-icon' : 'mc-conn-spinner');
        icon.textContent = isError ? '✕' : '';
        layer.querySelector('.mc-conn-title').textContent = title;
        layer.querySelector('.mc-conn-sub').textContent = sub || '';
        layer.classList.add('show');
    }

    // تفريغ النسخة الشبحية عند الإخفاء — عشان عناصرها (بنفس ids شاشة
    // الإعدادات مثل #agp-tiktok-username) ما تلخبط getElementById لاحقاً.
    function hideConnLayer() {
        if (!_mcConnLayer) return;
        _mcConnLayer.classList.remove('show');
        var backdrop = _mcConnLayer.querySelector('.mc-conn-backdrop');
        if (backdrop) backdrop.innerHTML = '';
    }

    document.addEventListener('click', function (e) {
        if (!e.target || e.target.id !== 'agp-connect-btn') return;
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('mc-settings-initial-box')) return;
        var kInput = el('agp-keyword');
        var uInput = el('agp-tiktok-username');
        // نفس شروط الملف المشترك (handleConnectClick): بدون يوزر أو كلمة
        // مفتاحية ما يصير اتصال أصلاً — فلا نعرض طبقة "جاري الاتصال".
        if (!kInput || !kInput.value.trim() || !uInput || !uInput.value.trim()) return;
        _mcConnKeywordBackup = kInput.value;
        var ghost = box.cloneNode(true);
        ghost.id = 'agp-shell-box-ghost';
        var layer = ensureConnLayer();
        var backdrop = layer.querySelector('.mc-conn-backdrop');
        backdrop.innerHTML = '';
        backdrop.appendChild(ghost);
        _mcConnErrorShown = false;
        showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
    }, true);

    function syncConnLayer() {
        var box = el('agp-shell-box');
        if (!box) return;

        if (box.classList.contains('agp-conn-error')) {
            if (!_mcConnErrorShown) {
                _mcConnErrorShown = true;
                var subEl = box.querySelector('.agp-shell-status');
                showConnLayer(true, 'تعذّر الاتصال', subEl ? subEl.textContent : 'تحقّق من اليوزرنيم وحاول مرة أخرى.');
                clearTimeout(_mcConnErrorTimer);
                _mcConnErrorTimer = setTimeout(function () {
                    hideConnLayer();
                    if (AGP.gameShell && typeof AGP.gameShell.setSetting === 'function') {
                        var s = AGP.gameShell.getSettings();
                        var firstKey = Object.keys(s)[0];
                        if (firstKey !== undefined) AGP.gameShell.setSetting(firstKey, s[firstKey]);
                    }
                    _mcConnKeywordPending = true;
                }, 2400);
            }
            return;
        }

        if (box.classList.contains('agp-connecting-box')) {
            clearTimeout(_mcConnErrorTimer);
            _mcConnErrorShown = false;
            if (!_mcConnLayer || !_mcConnLayer.classList.contains('show')) {
                showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
            }
            return;
        }

        clearTimeout(_mcConnErrorTimer);
        _mcConnErrorShown = false;
        if (box.classList.contains('agp-lobby-box')) hideConnLayer();
        if (_mcConnKeywordPending && box.classList.contains('mc-settings-initial-box')) {
            var kInput = el('agp-keyword');
            if (kInput) kInput.value = _mcConnKeywordBackup;
            _mcConnKeywordPending = false;
        }
    }

    function startShellOverlayWatcher() {
        applyShellEnhancements();
        syncConnLayer();
        var target = document.getElementById('agp-shell-overlay') || document.body;
        var observer = new MutationObserver(function () {
            applyShellEnhancements();
            syncConnLayer();
        });
        observer.observe(target, { childList: true, subtree: true });
    }

    /* -------- 14د) لوحة الإعدادات أثناء المباراة: زر رجوع للمنصة -------- */
    function enhanceMidMatchSettingsPanel(box) {
        if (document.getElementById('mc-settings-home-btn')) return;
        var btn = document.createElement('a');
        btn.id = 'mc-settings-home-btn';
        btn.href = '../../games.html';
        btn.className = 'mc-settings-home-btn';
        btn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';
        box.appendChild(btn);
    }

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
