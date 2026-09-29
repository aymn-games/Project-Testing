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

    // ⚠️ جاهزة تستقبل 10 لكل تصنيف (5 حالية + 5 إضافية قادمة) — بس خليتها
    // 5 فعلياً حالياً حتى ما تصير محاولات تشغيل ملفات غير مرفوعة بعد (صمت
    // صوتي نصف الوقت). أول ما ترفع 6.mp3...10.mp3 بنفس مسار shailat/
    // وkhaleeji/، غيّر الرقم تحت لـ10 وخلاص — بدون أي تعديل ثاني بالكود.
    var MUSIC_TRACK_COUNT = 5;
    var IRAQI_TRACK_COUNT = 10; // ⚠️ 10 مقاطع مرفوعة فعلياً بمجلد sounds/iraqi/ (5 + 5 إضافية) — شغّالة الآن
    // مدة تشغيل الأغنية: نفس خيارات السابق (10–35 ثانية بخطوة 5)
    var SPIN_DURATION_MIN_S = 10;
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
    var _musicVolume = 0.4;      // 0..1 — المصدر الوحيد للصوت بكل اللعبة (مؤثرات + موسيقى)
    var _currentMusicAudio = null;
    var _playedMusic = {};       // كل مقطع اشتغل بهذي الجلسة (url → true)
    var _musicHistory = [];      // ترتيب المقاطع اللي اشتغلت (الأحدث بالآخر)

    // ⚠️ عشوائي بدون تكرار أبداً بنفس الجلسة: كل دورة تختار مقطع ما
    // اشتغل قبل (من القسم المختار — "عشوائي" = كل الأقسام سوا). لما
    // تخلص كل مقاطع القسم، تتصفّر قائمة المشغَّل لهذا القسم ويرجع يختار
    // عشوائياً من البداية — مع استبعاد آخر نص مقاطع القسم اللي اشتغلت
    // (حتى ما يرجع مقطع سمعناه قبل دورتين أو ثلاث بس).
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
        var candidates = pool.filter(function (u) { return !_playedMusic[u]; });
        if (!candidates.length) {
            pool.forEach(function (u) { delete _playedMusic[u]; });
            candidates = pool.slice();
        }
        var inPool = {};
        pool.forEach(function (u) { inPool[u] = true; });
        var recent = _musicHistory.filter(function (u) { return inPool[u]; })
            .slice(-Math.floor(pool.length / 2));
        var fresh = candidates.filter(function (u) { return recent.indexOf(u) === -1; });
        if (fresh.length) candidates = fresh;
        var url = candidates[Math.floor(Math.random() * candidates.length)];
        _playedMusic[url] = true;
        _musicHistory.push(url);
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
    var _chairSize = 16;         // c — حجم الكرسي (% من عرض الدائرة)
    var _seatedThisRound = {};
    var _roundLosers = [];

    // 'idle' | 'playing' | 'claiming' | 'out' | 'champion' | 'ended'
    var _phase = 'idle';
    var _angle = 0;
    var _raf = null;
    var _spinSpeedIdx = 1;       // سرعة دوران اللاعبين: 0 بطيء، 1 عادي، 2 سريع
    var _spinTimeoutId = null;
    var _outTimeoutId = null;
    var _selectionOpen = false;
    var _pEls = {};
    var _ac = null;

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
        _seatedThisRound = {};
        _roundLosers = [];
        _angle = 0;
        stopRingLoop();
        stopMusic();
        if (_spinTimeoutId) { clearTimeout(_spinTimeoutId); _spinTimeoutId = null; }
        if (_outTimeoutId) { clearTimeout(_outTimeoutId); _outTimeoutId = null; }
        AGP.timerManager.stop(TIMER_NAME);
        _selectionOpen = false;
        unwireCommentListener();
        unwireTimerListeners();
        closeModal('mc-out-modal');
        clearCircle();
        setPhase('idle');
        renderCenter();
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

            /* ==================================================================
             * شاشة اللعب — مبنية حرفياً على ملف التصميم
             * design_handoff_musical_chairs (musical-chairs.dc.html + README.md):
             * هيدر (أزرار/شعار/عنوان) ← قائمة الإجراءات + دائرة اللعب، ونوافذ
             * الإقصاء/الإعدادات/إضافة لاعب.
             * ==================================================================== */
            'body.mc-game-on #agp-persistent-header{display:none !important;}',
            '#mc-stage{position:fixed;inset:0;z-index:10;height:100vh;height:100dvh;overflow:hidden;',
            'display:flex;flex-direction:column;direction:rtl;color:#f3eefb;',
            'font-family:"IBM Plex Sans Arabic",sans-serif;',
            'background:radial-gradient(70% 60% at 50% 55%,rgba(124,58,237,0.28) 0%,rgba(124,58,237,0) 70%),',
            'radial-gradient(60% 50% at 100% 100%,rgba(217,70,239,0.16) 0%,rgba(217,70,239,0) 70%),',
            'radial-gradient(50% 45% at 0% 0%,rgba(34,195,238,0.10) 0%,rgba(34,195,238,0) 70%),',
            'linear-gradient(180deg,#130a24 0%,#0d0719 100%);}',
            '#mc-stage *{box-sizing:border-box;}',
            '#mc-stage button{font-family:inherit;}',

            /* 1) الهيدر */
            '.mc-header{min-height:clamp(54px,7vh,76px);flex-shrink:0;display:grid;grid-template-columns:1fr auto 1fr;',
            'gap:clamp(8px,1.4vw,16px);align-items:center;padding:clamp(6px,1vh,10px) clamp(10px,2vw,24px);',
            'background:linear-gradient(180deg,rgba(26,14,46,0.95),rgba(19,10,36,0.85));',
            'border-bottom:1px solid rgba(190,140,255,0.14);',
            'box-shadow:0 1px 0 rgba(255,255,255,0.03),0 10px 30px rgba(0,0,0,0.35);}',
            '.mc-header-btns{display:flex;flex-wrap:wrap;align-items:center;gap:clamp(6px,0.7vw,10px);min-width:0;}',
            '.mc-hbtn{flex-shrink:0;display:flex;align-items:center;gap:6px;white-space:nowrap;height:clamp(34px,4.4vh,44px);',
            'padding:0 clamp(10px,1.1vw,16px);border-radius:999px;border:1px solid rgba(190,140,255,0.3);',
            'background:rgba(255,255,255,0.04);color:#f3eefb;cursor:pointer;font-size:clamp(12px,1.05vw,15px);',
            'font-weight:600;transition:background .2s,border-color .2s;}',
            '.mc-hbtn:hover{background:rgba(217,70,239,0.18);border-color:rgba(217,70,239,0.5);}',
            '.mc-spin-btn{flex-shrink:0;display:flex;align-items:center;gap:6px;white-space:nowrap;height:clamp(34px,4.4vh,44px);',
            'padding:0 clamp(12px,1.4vw,20px);border-radius:999px;border:none;cursor:pointer;font-size:clamp(12px,1.05vw,15px);',
            'font-weight:700;color:#fff;background:linear-gradient(135deg,#d946ef,#7c3aed);',
            'box-shadow:0 0 0 1px rgba(255,255,255,0.12) inset,0 6px 18px rgba(217,70,239,0.35);}',
            '.mc-spin-btn:disabled{opacity:0.5;cursor:default;}',
            /* وقت الجلوس (مهلة اختيار الكرسي) — يظهر بالهيدر وقت الجلوس بس */
            '.mc-seat-timer{flex-shrink:0;display:flex;align-items:center;gap:6px;white-space:nowrap;height:clamp(34px,4.4vh,44px);',
            'padding:0 clamp(12px,1.4vw,18px);border-radius:999px;font-size:clamp(12px,1.05vw,15px);font-weight:700;',
            'color:#1a0c2e;background:#f5a623;box-shadow:0 0 14px rgba(245,166,35,0.45);}',
            '.mc-seat-timer[hidden]{display:none;}',
            '.mc-seat-timer b{font-size:1.2em;font-weight:800;font-variant-numeric:tabular-nums;}',
            '.mc-seat-timer.mc-warn{background:#ff5c7a;color:#fff;box-shadow:0 0 14px rgba(255,92,122,0.55);}',
            '.mc-header-logo{justify-self:center;height:clamp(34px,5.2vh,56px);max-width:100%;width:auto;display:block;}',
            '.mc-header-end{justify-self:end;display:flex;align-items:center;gap:clamp(6px,0.7vw,10px);min-width:0;}',
            '.mc-header-title{justify-self:end;white-space:nowrap;display:flex;align-items:center;gap:8px;font-weight:700;',
            'font-size:clamp(13px,1.15vw,17px);padding:clamp(5px,0.8vh,8px) clamp(12px,1.4vw,22px);border-radius:999px;',
            'background:linear-gradient(135deg,rgba(217,70,239,0.22),rgba(124,58,237,0.22));',
            'border:1px solid rgba(217,70,239,0.35);box-shadow:0 0 24px rgba(217,70,239,0.18);}',

            /* 2) المحتوى */
            '.mc-main{flex:1;display:flex;flex-direction:row;gap:clamp(14px,2vw,28px);padding:clamp(14px,2vw,28px);min-height:0;}',
            '#mc-stage.mc-panel-closed .mc-main{gap:0;}',

            /* 2أ) قائمة الإجراءات */
            '.mc-panel{flex:0 0 auto;width:clamp(280px,24vw,360px);max-height:100%;opacity:1;overflow:hidden;',
            'transition:width .35s ease,max-height .35s ease,opacity .25s ease;display:flex;min-height:0;}',
            '#mc-stage.mc-panel-closed .mc-panel{width:0;opacity:0;}',
            '.mc-panel-inner{width:clamp(280px,24vw,360px);flex-shrink:0;min-height:0;overflow-y:auto;display:flex;',
            'flex-direction:column;gap:clamp(8px,1.4vh,14px);}',
            '.mc-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 16px;',
            'border-radius:14px;border:1px solid rgba(190,140,255,0.25);background:rgba(20,8,36,0.6);color:#f3eefb;',
            'cursor:pointer;font-size:15px;font-weight:600;flex-shrink:0;height:clamp(40px,5vh,48px);}',
            '.mc-panel-head span:last-child{font-size:13px;color:#bfaedb;}',
            '.mc-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}',
            '.mc-stat{padding:clamp(6px,1.2vh,14px) 10px;border-radius:16px;background:rgba(255,255,255,0.05);',
            'border:1px solid rgba(190,140,255,0.2);text-align:center;}',
            '.mc-stat-lbl{font-size:12px;color:#bfaedb;}',
            '.mc-stat-val{font-size:clamp(20px,2.8vh,26px);font-weight:700;}',
            '.mc-stat-val.mc-gold{color:#f5a623;}',
            '.mc-game-settings{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:clamp(10px,1.8vh,18px);',
            'padding:clamp(12px,1.8vh,18px);border-radius:20px;background:rgba(20,8,36,0.6);border:1px solid rgba(190,140,255,0.25);}',
            '.mc-gs-title{grid-column:1/-1;font-size:13px;font-weight:600;color:#bfaedb;letter-spacing:0.02em;}',
            '.mc-gs-row{display:flex;flex-direction:column;gap:8px;}',
            '.mc-gs-lbl{font-size:14px;font-weight:600;}',
            '.mc-gs-lbl-row{display:flex;justify-content:space-between;font-size:14px;font-weight:600;}',
            '.mc-gs-lbl-row span{color:#f5a623;}',
            '.mc-seg{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:4px;padding:4px;border-radius:12px;background:rgba(0,0,0,0.35);}',
            '.mc-seg-4{grid-template-columns:repeat(4,1fr);}',
            '.mc-seg button{height:36px;border-radius:9px;border:none;cursor:pointer;font-size:14px;font-weight:600;',
            'background:transparent;color:#bfaedb;}',
            '.mc-seg button.mc-on{background:#8b5cf6;color:#fff;}',
            '#mc-seat-times button{white-space:nowrap;font-size:13px;padding:0 2px;}',
            '.mc-modal .mc-seg button{height:38px;}',
            '.mc-stepper{display:flex;align-items:center;justify-content:space-between;padding:4px;border-radius:12px;background:rgba(0,0,0,0.35);}',
            '.mc-stepper button{width:40px;height:40px;border-radius:9px;border:none;background:rgba(255,255,255,0.08);',
            'color:#fff;font-size:20px;cursor:pointer;}',
            '.mc-stepper div{font-size:16px;font-weight:600;}',
            '.mc-vol{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:rgba(0,0,0,0.35);}',
            '.mc-vol input{flex:1;accent-color:#f5a623;}',
            '.mc-mute-btn{border:none;background:none;color:#fff;font-size:16px;cursor:pointer;padding:0;line-height:1;}',

            /* 2ب) دائرة اللعب */
            '.mc-arena{position:relative;flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:10px;}',
            '.mc-cq{flex:1;min-height:0;container-type:size;display:flex;align-items:center;justify-content:center;}',
            '.mc-circle{position:relative;width:min(100cqw - 50px,100cqh - 50px);aspect-ratio:1;container-type:inline-size;}',
            '.mc-ring{position:absolute;inset:0;border-radius:50%;padding:3px;',
            'background:conic-gradient(#e040fb,#8b5cf6,#22c3ee,#8fd16a,#f5a623,#e040fb);}',
            '.mc-ring div{width:100%;height:100%;border-radius:50%;background:#1a0c2e;box-shadow:inset 0 0 80px rgba(139,92,246,0.25);}',
            '.mc-watermark{position:absolute;left:50%;top:50%;width:62%;height:auto;transform:translate(-50%,-50%);opacity:0.1;pointer-events:none;}',
            '.mc-ch{position:absolute;aspect-ratio:1;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;}',
            '.mc-ch-glyph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;line-height:1;',
            'filter:drop-shadow(0 4px 8px rgba(0,0,0,0.5));}',
            '.mc-ch-num{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:0.12em 0.28em;border-radius:0.3em;',
            'display:none;align-items:center;justify-content:center;background:#f5a623;color:#1a0c2e;font-weight:800;line-height:1;',
            'letter-spacing:-0.03em;font-variant-numeric:tabular-nums;box-shadow:0 0 14px rgba(245,166,35,0.45);}',
            '.mc-ch.mc-numbered .mc-ch-num{display:flex;}',
            '.mc-ch.mc-taken .mc-ch-glyph,.mc-ch.mc-taken .mc-ch-num{display:none;}',
            '.mc-p{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;z-index:2;}',
            '.mc-p.mc-moving{transition:left .6s cubic-bezier(.34,1.45,.64,1),top .6s cubic-bezier(.34,1.45,.64,1);}',
            '.mc-p.mc-seated{z-index:3;}',
            '.mc-p-av{aspect-ratio:1;transition:width .5s ease,border-color .3s,box-shadow .3s;border-radius:50%;display:flex;',
            'align-items:center;justify-content:center;background:#1a0c2e;border:2px solid #22c3ee;',
            'box-shadow:0 0 12px rgba(34,195,238,0.45);font-weight:700;overflow:hidden;}',
            '.mc-p-av img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.mc-p.mc-seated .mc-p-av{border-color:#f5a623;box-shadow:0 0 12px rgba(245,166,35,0.55);}',
            '.mc-p.mc-out .mc-p-av{border-color:#ff5c7a;box-shadow:0 0 12px rgba(255,92,122,0.6);}',
            '.mc-p-name{font-size:clamp(11px,2.2cqw,15px);padding:1px 8px;border-radius:999px;background:rgba(0,0,0,0.6);white-space:nowrap;}',
            '.mc-p.mc-seated .mc-p-name,.mc-circle.mc-no-names .mc-p-name{display:none;}',
            '.mc-center{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;',
            'gap:10px;text-align:center;}',
            '.mc-center.mc-show{display:flex;}',
            '.mc-ended-title{font-size:6cqw;font-weight:700;}',
            '.mc-ended-sub{font-size:2.6cqw;color:#bfaedb;}',

            /* النوافذ */
            '.mc-modal{position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;padding:20px;',
            'background:rgba(8,4,16,0.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}',
            '.mc-modal.mc-show{display:flex;}',
            '.mc-card{position:relative;max-height:calc(100dvh - 40px);min-height:0;overflow-y:auto;display:flex;flex-direction:column;',
            'gap:18px;padding:22px;border-radius:22px;background:linear-gradient(180deg,#1d1033,#150b27);',
            'border:1px solid rgba(190,140,255,0.25);box-shadow:0 30px 80px rgba(0,0,0,0.6);}',
            '.mc-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;}',
            '.mc-card-title{font-size:19px;font-weight:700;}',
            '.mc-x{width:38px;height:38px;flex-shrink:0;border-radius:50%;border:1px solid rgba(190,140,255,0.25);',
            'background:rgba(255,255,255,0.05);color:#fff;cursor:pointer;font-size:18px;line-height:1;transition:background .2s,border-color .2s;}',
            '.mc-x:hover{background:rgba(255,92,122,0.2);border-color:rgba(255,92,122,0.5);}',
            '.mc-btn-primary{border:none;cursor:pointer;font-weight:700;color:#fff;',
            'background:linear-gradient(135deg,#d946ef,#7c3aed);box-shadow:0 6px 18px rgba(217,70,239,0.35);}',
            // نافذة الإقصاء
            '#mc-out-modal{transition:opacity .35s ease;opacity:0;}',
            '#mc-out-modal.mc-in{opacity:1;}',
            '#mc-out-modal .mc-card{width:min(820px,100%);transform:scale(0.85) translateY(20px);',
            'transition:transform .55s cubic-bezier(.34,1.56,.64,1);}',
            '#mc-out-modal.mc-in .mc-card{transform:scale(1);}',
            '#mc-out-modal .mc-x{position:absolute;top:16px;left:16px;}',
            '.mc-out-head{display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:4px;}',
            '.mc-out-head img{height:clamp(44px,8vh,64px);width:auto;max-width:70%;}',
            '.mc-out-title{font-size:18px;font-weight:700;}',
            '.mc-out-sub{font-size:13px;color:#bfaedb;}',
            '.mc-out-list{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;}',
            '.mc-out-item{width:clamp(104px,14vw,132px);display:flex;flex-direction:column;align-items:center;gap:8px;',
            'padding:14px 8px;border-radius:16px;background:rgba(255,92,122,0.14);border:1px solid rgba(255,92,122,0.6);',
            'opacity:0;transform:scale(0.6);transition:opacity .4s ease,transform .5s cubic-bezier(.34,1.56,.64,1);}',
            '#mc-out-modal.mc-in .mc-out-item{opacity:1;transform:scale(1);}',
            '.mc-out-av{width:clamp(68px,9vw,88px);height:clamp(68px,9vw,88px);border-radius:50%;display:flex;align-items:center;',
            'justify-content:center;background:#1a0c2e;border:3px solid #ff5c7a;box-shadow:0 0 18px rgba(255,92,122,0.45);',
            'font-weight:700;font-size:clamp(20px,2.6vw,26px);overflow:hidden;}',
            '.mc-out-av img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.mc-out-name{font-size:clamp(14px,1.4vw,17px);font-weight:700;text-align:center;overflow-wrap:anywhere;}',
            '.mc-out-tag{font-size:12px;color:#ff8da3;}',
            '.mc-out-next{align-self:center;height:44px;padding:0 28px;border-radius:999px;font-size:15px;}',
            // نافذة الإعدادات
            '#mc-settings-modal .mc-card{width:min(460px,100%);}',
            '.mc-end-btn{height:46px;border-radius:12px;border:none;background:#ff5c7a;color:#fff;cursor:pointer;',
            'font-size:15px;font-weight:700;transition:background .2s;}',
            '.mc-end-btn:hover{background:#e0405f;}',
            '.mc-reset-btn{height:46px;border-radius:12px;border:1px solid rgba(255,92,122,0.45);background:transparent;',
            'color:#ff8da3;cursor:pointer;font-size:15px;font-weight:600;transition:background .2s;}',
            '.mc-reset-btn:hover{background:rgba(255,92,122,0.15);}',
            // نافذة إضافة لاعب
            '#mc-add-modal{z-index:60;background:rgba(8,4,16,0.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);}',
            '#mc-add-modal .mc-card{width:500px;height:700px;max-width:100%;gap:16px;background:rgba(29,16,51,0.4);',
            'border:2px solid rgba(217,70,239,0.55);box-shadow:0 0 30px rgba(217,70,239,0.25),0 30px 80px rgba(0,0,0,0.5);overflow:hidden;}',
            '.mc-add-body{flex:1;min-height:0;display:flex;flex-direction:column;gap:14px;font-size:15px;line-height:1.8;color:#e7dcf7;}',
            '.mc-add-done{flex-shrink:0;height:50px;border-radius:14px;font-size:16px;}',
            '.mc-join-status{align-self:flex-start;display:flex;align-items:center;gap:8px;padding:4px 14px;border-radius:999px;',
            'font-size:13px;font-weight:700;background:rgba(79,209,138,0.16);border:1px solid rgba(79,209,138,0.5);color:#8ff0b8;}',
            '.mc-join-status::before{content:"";width:8px;height:8px;border-radius:50%;background:#4fd18a;}',
            '.mc-join-status.mc-closed{background:rgba(255,92,122,0.14);border-color:rgba(255,92,122,0.5);color:#ff8da3;}',
            '.mc-join-status.mc-closed::before{background:#ff5c7a;}',
            '.mc-join-kw{display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 16px;border-radius:16px;',
            'background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.4);text-align:center;}',
            '.mc-join-kw span{font-size:14px;font-weight:600;color:#f3eefb;}',
            '.mc-join-kw b{font-size:30px;font-weight:800;line-height:1.3;color:#f5a623;word-break:break-word;}',
            '.mc-join-notes{margin:0;padding:0 18px 0 0;font-size:13px;line-height:1.9;color:#bfaedb;}',
            '.mc-join-count{font-size:14px;font-weight:700;color:#f3eefb;}',
            '.mc-join-count span{color:#f5a623;}',
            /* بطاقات اللاعبين الجدد — نفس بطاقات اللوبي الأساسي (217×57)،
             * لاعبين بكل صف، وتمرير مخفي للأسفل لو العدد كبير */
            '#mc-join-list{list-style:none;margin:0;padding:10px 0 12px;flex:1;min-height:0;overflow-y:auto;',
            'scrollbar-width:none;-ms-overflow-style:none;display:grid;grid-template-columns:repeat(2,217px);',
            'column-gap:16px;row-gap:18px;justify-content:center;justify-items:center;align-items:end;align-content:start;}',
            '#mc-join-list::-webkit-scrollbar{display:none;}',
            '@media (max-width:520px){#mc-join-list{grid-template-columns:217px;}}',
            '#mc-join-list li{position:relative;display:flex;align-items:center;padding:0;}',
            '#mc-join-list .mc-join-empty{grid-column:1 / -1;width:100%;box-sizing:border-box;padding:18px;border-radius:14px;',
            'border:1px dashed rgba(190,140,255,0.3);text-align:center;font-size:13px;color:#8f7fae;}',
            '#mc-join-list .agp-pcard{width:217px !important;height:57px !important;box-sizing:border-box !important;',
            'padding:0 3px 0 28px !important;gap:6px !important;border-radius:24px !important;',
            'background:rgba(217,217,217,.3) !important;border:2px solid #000 !important;max-width:none !important;}',
            '#mc-join-list .agp-pcard-avatar-basic{width:48px !important;height:48px !important;background:#D9D9D9 !important;border:none !important;}',
            '#mc-join-list .agp-pcard-name-basic{flex:1 1 auto !important;width:auto !important;min-width:0 !important;',
            'height:auto !important;margin:0 !important;padding:0 !important;font-size:20px !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;font-weight:700 !important;color:#fff !important;',
            'background:none !important;border:none !important;}',
            '#mc-join-list .agp-pcard-avatar-basic--fallback{font-size:15px !important;color:#3a2f4a !important;}',
            '#mc-join-list li:has(> .agp-pcard-tpl){width:217px !important;height:57px !important;overflow:visible !important;',
            'display:flex !important;flex-direction:row !important;align-items:center !important;justify-content:center !important;}',
            '#mc-join-list .agp-pcard-tpl{zoom:0.7282;flex-shrink:0 !important;}',
            '#mc-join-list .agp-player-remove-btn{position:absolute;top:50%;left:7px;right:auto;transform:translateY(-50%);',
            'width:16px;height:16px;font-size:9px;z-index:5;padding:0;line-height:1;cursor:pointer;border-radius:50%;',
            'border:1px solid rgba(224,115,111,.55);background:rgba(224,115,111,.18);color:#e0736f;}',
            '#mc-join-list .agp-player-remove-btn:hover{background:rgba(224,115,111,.3);color:#ff9b96;}',

            /* الوضع العمودي / الشاشات الأضيق من 900px */
            '@media (max-width:899px),(max-aspect-ratio:9/10){',
            '.mc-header{grid-template-columns:1fr auto;}',
            '.mc-header-btns{grid-area:2 / 1 / 3 / 3;}',
            '.mc-main{flex-direction:column;}',
            '.mc-panel,.mc-panel-inner{width:100%;}',
            '#mc-stage.mc-panel-closed .mc-panel{width:100%;max-height:0;}}',


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
     *  4) بناء شاشة اللعب — حرفياً من ملف التصميم
     *     design_handoff_musical_chairs (هيدر ← قائمة الإجراءات + الدائرة،
     *     ونوافذ الإقصاء/الإعدادات/إضافة لاعب).
     * ==================================================================== */
    var GENRES = [
        { label: 'عشوائي', mode: 'random' },
        { label: 'خليجي', mode: 'khaleeji' },
        { label: 'عراقي', mode: 'iraqi' },
        { label: 'شيلات', mode: 'shailat' }
    ];
    var SPIN_SPEEDS = [{ label: 'بطيء', factor: 0.55 }, { label: 'عادي', factor: 1 }, { label: 'سريع', factor: 1.8 }];
    var SPIN_BTN_LABELS = {
        idle: '▶ تدوير', playing: '⏸ إيقاف', claiming: '⏳ جاري الجلوس',
        out: '▶ الدورة التالية', champion: '↺ لعبة جديدة', ended: '↺ مباراة جديدة'
    };

    function ensureScaffolding() {
        injectStageStyles();
        document.body.classList.add('mc-game-on');
        if (el('mc-stage')) return;
        var stage = document.createElement('div');
        stage.id = 'mc-stage';
        stage.setAttribute('dir', 'rtl');
        stage.innerHTML =
            '<header class="mc-header">' +
                '<div class="mc-header-btns">' +
                    '<button type="button" class="mc-hbtn" id="mc-add-btn" title="إضافة لاعب جديد">➕ إضافة لاعب</button>' +
                    '<button type="button" class="mc-hbtn" id="mc-settings-btn" title="الإعدادات">⚙️ الإعدادات</button>' +
                    '<button type="button" class="mc-hbtn" id="mc-panel-btn" title="قائمة الإجراءات">☰ الإجراءات</button>' +
                    '<button type="button" class="mc-spin-btn" id="mc-spin-btn">▶ تدوير</button>' +
                '</div>' +
                '<img class="mc-header-logo" src="../../logo.png" alt="ألعاب أيمن">' +
                '<div class="mc-header-end">' +
                    '<div class="mc-seat-timer" id="mc-seat-timer" hidden>⏱ وقت الجلوس <b id="mc-seat-timer-val">15</b> ثانية</div>' +
                    '<div class="mc-header-title">🎵 الكراسي الموسيقية</div>' +
                '</div>' +
            '</header>' +
            '<main class="mc-main">' +
                '<aside class="mc-panel"><div class="mc-panel-inner">' +
                    '<button type="button" class="mc-panel-head" id="mc-panel-head"><span>☰ قائمة الإجراءات</span><span>طي ←</span></button>' +
                    '<section class="mc-stats">' +
                        '<div class="mc-stat"><div class="mc-stat-lbl">الدورة</div><div class="mc-stat-val mc-gold" id="mc-stat-round">1</div></div>' +
                        '<div class="mc-stat"><div class="mc-stat-lbl">👥 اللاعبون</div><div class="mc-stat-val" id="mc-stat-players">0</div></div>' +
                        '<div class="mc-stat"><div class="mc-stat-lbl">🪑 الكراسي</div><div class="mc-stat-val" id="mc-stat-chairs">0</div></div>' +
                    '</section>' +
                    '<section class="mc-game-settings">' +
                        '<div class="mc-gs-title">إعدادات اللعبة</div>' +
                        '<div class="mc-gs-row"><label class="mc-gs-lbl">نوع الأغاني</label>' +
                            '<div class="mc-seg mc-seg-4" id="mc-genres"></div></div>' +
                        '<div class="mc-gs-row"><label class="mc-gs-lbl">مدة تشغيل الأغنية</label>' +
                            '<div class="mc-stepper">' +
                                '<button type="button" id="mc-dur-up">+</button>' +
                                '<div>⏱ <span id="mc-dur-val">15</span> ثانية</div>' +
                                '<button type="button" id="mc-dur-down">−</button>' +
                            '</div></div>' +
                        '<div class="mc-gs-row"><label class="mc-gs-lbl">مهلة اختيار الكرسي</label>' +
                            '<div class="mc-seg mc-seg-4" id="mc-seat-times"></div></div>' +
                        '<div class="mc-gs-row"><div class="mc-gs-lbl-row"><label>مستوى الصوت</label><span id="mc-vol-val">40%</span></div>' +
                            '<div class="mc-vol"><button type="button" class="mc-mute-btn" id="mc-mute-btn" title="كتم/تشغيل الصوت">🔊</button><input type="range" id="mc-volume-slider" min="0" max="100" value="40"></div></div>' +
                    '</section>' +
                '</div></aside>' +
                '<section class="mc-arena"><div class="mc-cq"><div class="mc-circle" id="mc-circle">' +
                    '<div class="mc-ring"><div></div></div>' +
                    '<img class="mc-watermark" src="../../logo.png" alt="">' +
                    '<div id="mc-chairs"></div>' +
                    '<div class="mc-center" id="mc-center"></div>' +
                    '<div id="mc-players"></div>' +
                '</div></div></section>' +
            '</main>' +

            '<div class="mc-modal" id="mc-add-modal"><div class="mc-card">' +
                '<div class="mc-card-head"><div class="mc-card-title">➕ إضافة لاعب جديد</div>' +
                '<button type="button" class="mc-x" id="mc-add-x" title="إغلاق">✕</button></div>' +
                '<div class="mc-add-body">' +
                    '<div class="mc-join-status" id="mc-join-status"></div>' +
                    '<div class="mc-join-kw"><span>للدخول اكتب في شات البث</span><b id="mc-join-keyword"></b></div>' +
                    '<ul class="mc-join-notes">' +
                        '<li>الدخول مفتوح الآن للاعبين الجدد اللي ما سبق لهم الدخول بهذي المباراة.</li>' +
                        '<li>الكلمة المفتاحية هي نفسها اللي حددتها قبل بداية المباراة.</li>' +
                        '<li>كل لاعب جديد يدخل تظهر بطاقته هنا، وينضم للدائرة مباشرة.</li>' +
                    '</ul>' +
                    '<div class="mc-join-count">اللاعبون الجدد (<span id="mc-join-count">0</span>)</div>' +
                    '<ul id="mc-join-list"></ul>' +
                '</div>' +
                '<button type="button" class="mc-btn-primary mc-add-done" id="mc-add-done">أكمل المباراة</button>' +
            '</div></div>' +

            '<div class="mc-modal" id="mc-out-modal"><div class="mc-card">' +
                '<button type="button" class="mc-x" id="mc-out-x" title="إغلاق">✕</button>' +
                '<div class="mc-out-head"><img src="../../logo.png" alt="ألعاب أيمن">' +
                '<div class="mc-out-title">اللاعبون المُقصَون</div><div class="mc-out-sub" id="mc-out-sub"></div></div>' +
                '<div class="mc-out-list" id="mc-out-list"></div>' +
                '<button type="button" class="mc-btn-primary mc-out-next" id="mc-out-next">متابعة</button>' +
            '</div></div>' +

            '<div class="mc-modal" id="mc-settings-modal"><div class="mc-card">' +
                '<div class="mc-card-head"><div class="mc-card-title">⚙️ الإعدادات</div>' +
                '<button type="button" class="mc-x" data-close="mc-settings-modal" title="إغلاق">✕</button></div>' +
                '<div class="mc-gs-row"><div class="mc-gs-lbl">سرعة دوران اللاعبين</div><div class="mc-seg" id="mc-spin-speeds"></div></div>' +
                '<button type="button" class="mc-end-btn" id="mc-end-btn">⏹ إنهاء المباراة</button>' +
                '<button type="button" class="mc-reset-btn" id="mc-reset-btn">↺ إعادة اللعبة من البداية</button>' +
            '</div></div>';
        document.body.appendChild(stage);
        wireStageEvents();
    }

    function openModal(id) { var m = el(id); if (m) m.classList.add('mc-show'); }
    function closeModal(id) { var m = el(id); if (m) m.classList.remove('mc-show', 'mc-in'); }

    function wireStageEvents() {
        el('mc-spin-btn').onclick = handleSpinButtonClick;
        // ⚙️ = تبويب الإعدادات الجديد (بدل لوحة الإعدادات القديمة المشتركة)
        el('mc-settings-btn').onclick = function () { renderSpinSpeeds(); openModal('mc-settings-modal'); };
        // ➕ = تبويب إضافة لاعب جديد (يفتح الدخول بالكلمة المفتاحية)
        el('mc-add-btn').onclick = openJoin;
        el('mc-add-x').onclick = closeJoin;
        el('mc-add-done').onclick = closeJoin;
        el('mc-panel-btn').onclick = togglePanel;
        el('mc-panel-head').onclick = togglePanel;

        Array.prototype.forEach.call(el('mc-stage').querySelectorAll('[data-close]'), function (b) {
            b.onclick = function () { closeModal(b.getAttribute('data-close')); };
        });
        // النقر على الخلفية يقفل النافذة (نافذة الإقصاء تكمل للدورة الجاية)
        el('mc-settings-modal').addEventListener('click', function (e) { if (e.target.id === 'mc-settings-modal') closeModal('mc-settings-modal'); });
        el('mc-add-modal').addEventListener('click', function (e) { if (e.target.id === 'mc-add-modal') closeJoin(); });
        el('mc-out-modal').addEventListener('click', function (e) { if (e.target.id === 'mc-out-modal') closeOutModal(); });
        el('mc-out-x').onclick = closeOutModal;
        el('mc-out-next').onclick = closeOutModal;

        el('mc-end-btn').onclick = function () { closeModal('mc-settings-modal'); endMatchEarly(); };
        el('mc-reset-btn').onclick = function () { closeModal('mc-settings-modal'); restartMatch(); };

        el('mc-dur-up').onclick = function () { setSpinDuration(spinDuration() + 5); };
        el('mc-dur-down').onclick = function () { setSpinDuration(spinDuration() - 5); };

        // 🔊 = زر الكتم القديم
        var muteBtn = el('mc-mute-btn');
        muteBtn.onclick = function () {
            _musicMuted = !_musicMuted;
            muteBtn.textContent = _musicMuted ? '🔇' : '🔊';
            applyMusicVolumeLive();
        };

        var vol = el('mc-volume-slider');
        vol.value = Math.round(_musicVolume * 100);
        vol.oninput = function () {
            _musicVolume = Number(vol.value) / 100;
            if (_musicMuted && _musicVolume > 0) { _musicMuted = false; muteBtn.textContent = '🔊'; }
            el('mc-vol-val').textContent = vol.value + '%';
            applyMusicVolumeLive();
        };
        el('mc-vol-val').textContent = vol.value + '%';

        renderGenres();
        renderSeatTimes();
        el('mc-dur-val').textContent = spinDuration();
    }

    /* -------- تبويب إضافة لاعب جديد --------
     * يفتح الدخول بنفس الكلمة المفتاحية المحددة قبل المباراة. اللاعب
     * الجديد ينضم للدائرة مباشرة (handlePlayerJoined)، واللي سبق له
     * الدخول (حتى لو انقصى) ما يقدر يدخل مرة ثانية. "أكمل المباراة"
     * (أو ✕ أو النقر على الخلفية) يقفل الدخول. */
    var _joinKnownIds = null;

    function joinMaxReached() {
        var max = liveSettings().maxPlayers;
        return Boolean(max) && AGP.gameManager.getPlayers().length >= max;
    }

    function openJoin() {
        _joinKnownIds = {};
        AGP.gameManager.getPlayers().forEach(function (p) { _joinKnownIds[p.id] = true; });
        if (!joinMaxReached() && AGP.keywordManager) AGP.keywordManager.activate();
        renderJoinPanel();
        openModal('mc-add-modal');
    }

    function closeJoin() {
        _joinKnownIds = null;
        if (AGP.keywordManager) AGP.keywordManager.deactivate();
        closeModal('mc-add-modal');
    }

    function renderJoinPanel() {
        if (!_joinKnownIds || !el('mc-join-list')) return;
        var open = AGP.keywordManager && AGP.keywordManager.isActive();
        var status = el('mc-join-status');
        status.classList.toggle('mc-closed', !open);
        status.textContent = open ? 'الدخول مفتوح الآن' :
            'الدخول مقفل — وصلنا الحد الأقصى للاعبين (' + liveSettings().maxPlayers + ')';
        el('mc-join-keyword').textContent = (AGP.keywordManager && AGP.keywordManager.getKeyword()) || '';

        var newPlayers = AGP.gameManager.getPlayers().filter(function (p) { return !_joinKnownIds[p.id]; });
        el('mc-join-count').textContent = newPlayers.length;
        var list = el('mc-join-list');
        if (!newPlayers.length) {
            list.innerHTML = '<li class="mc-join-empty">بانتظار دخول لاعبين جدد من الشات…</li>';
            return;
        }
        list.innerHTML = newPlayers.map(function (p) {
            var card = AGP.playerCard ? AGP.playerCard.renderHtml(p, { showFrame: true, basePath: '../../' }) : escapeHtml(playerLabel(p));
            return '<li><button type="button" class="agp-player-remove-btn" data-remove-id="' + escapeHtml(p.id) + '" title="حذف">✕</button>' + card + '</li>';
        }).join('');
        Array.prototype.forEach.call(list.querySelectorAll('[data-remove-id]'), function (btn) {
            btn.onclick = function () {
                if (AGP.player && typeof AGP.player.removePlayer === 'function') AGP.player.removePlayer(btn.getAttribute('data-remove-id'));
            };
        });
        if (AGP.playerCard && typeof AGP.playerCard.fitAllNames === 'function') AGP.playerCard.fitAllNames(list);
        fitFramedCards(list);
    }

    function togglePanel() {
        el('mc-stage').classList.toggle('mc-panel-closed');
    }

    // مهلة اختيار الكرسي — نفس إعداد selectionTimerSeconds بشاشة الإعدادات
    // الأساسية، وتنطبق من الدورة الجاية.
    function seatTime() { return Number(liveSettings().selectionTimerSeconds) || 15; }
    function renderSeatTimes() {
        var wrap = el('mc-seat-times');
        if (!wrap) return;
        var cur = seatTime();
        wrap.innerHTML = SELECTION_TIMER_OPTIONS.map(function (o) {
            return '<button type="button" data-secs="' + o.value + '"' + (o.value === cur ? ' class="mc-on"' : '') + '>' + o.label + '</button>';
        }).join('');
        Array.prototype.forEach.call(wrap.children, function (b) {
            b.onclick = function () {
                if (AGP.gameShell.setSetting) AGP.gameShell.setSetting('selectionTimerSeconds', Number(b.getAttribute('data-secs')));
                renderSeatTimes();
            };
        });
    }

    function showSeatTimer(secs) {
        var t = el('mc-seat-timer');
        if (!t) return;
        if (secs == null) { t.hidden = true; return; }
        el('mc-seat-timer-val').textContent = secs;
        t.classList.toggle('mc-warn', secs <= 5);
        t.hidden = false;
    }

    function renderGenres() {
        var wrap = el('mc-genres');
        wrap.innerHTML = GENRES.map(function (g) {
            return '<button type="button" data-mode="' + g.mode + '"' + (g.mode === _musicMode ? ' class="mc-on"' : '') + '>' + g.label + '</button>';
        }).join('');
        Array.prototype.forEach.call(wrap.children, function (b) {
            b.onclick = function () { _musicMode = b.getAttribute('data-mode'); renderGenres(); };
        });
    }

    function renderSpinSpeeds() {
        var wrap = el('mc-spin-speeds');
        wrap.innerHTML = SPIN_SPEEDS.map(function (s, i) {
            return '<button type="button" data-i="' + i + '"' + (i === _spinSpeedIdx ? ' class="mc-on"' : '') + '>' + s.label + '</button>';
        }).join('');
        Array.prototype.forEach.call(wrap.children, function (b) {
            b.onclick = function () { _spinSpeedIdx = Number(b.getAttribute('data-i')); renderSpinSpeeds(); };
        });
    }

    // مدة تشغيل الأغنية — نفس إعداد spinDurationSeconds بشاشة الإعدادات
    // الأولى، يُعدَّل هنا بخطوة 5 ثوانٍ بين 5 و60 (حسب ملف التصميم).
    function spinDuration() {
        var s = Number(liveSettings().spinDurationSeconds) || 15;
        return Math.max(SPIN_DURATION_MIN_S, Math.min(SPIN_DURATION_MAX_S, s));
    }
    function setSpinDuration(secs) {
        secs = Math.max(SPIN_DURATION_MIN_S, Math.min(SPIN_DURATION_MAX_S, secs));
        if (AGP.gameShell.setSetting) AGP.gameShell.setSetting('spinDurationSeconds', secs);
        el('mc-dur-val').textContent = secs;
    }

    function setPhase(phase) {
        _phase = phase;
        if (phase !== 'claiming') showSeatTimer(null);
        var btn = el('mc-spin-btn');
        if (btn) {
            btn.textContent = SPIN_BTN_LABELS[phase] || SPIN_BTN_LABELS.idle;
            btn.disabled = phase === 'claiming';
        }
    }

    function updateBadges() {
        if (!el('mc-stat-round')) return;
        el('mc-stat-round').textContent = Math.max(1, _roundNumber);
        el('mc-stat-players').textContent = _alive.length;
        el('mc-stat-chairs').textContent = _chairs.length;
    }

    /* ======================================================================
     *  5) رسم الكراسي واللاعبين على الدائرة
     * ==================================================================== */
    function initialsOf(player) {
        var name = playerLabel(player).trim();
        return name.replace('ال', '').slice(0, 2) || '؟';
    }

    function avatarHtml(player) {
        var initials = escapeHtml(initialsOf(player));
        if (player && player.avatarUrl) {
            return '<img src="' + escapeHtml(player.avatarUrl) + '" alt="" referrerpolicy="no-referrer" ' +
                'onerror="this.parentNode.textContent=\'' + initials.replace(/'/g, '') + '\';">';
        }
        return initials;
    }

    // حجم صورة اللاعب (% من عرض الدائرة) — pA = min(11, 314/N × 0.78)
    function playerAvatarPct() {
        return Math.min(11, 314 / Math.max(_alive.length, 1) * 0.78);
    }

    // الكراسي بحلقات متحدة المركز داخل الدائرة (كرسي واحد = بالمنتصف).
    // الحلقة k تتسع حتى floor(6.28·k) كرسي، التوزيع نسبي، والحلقات
    // الفردية تنزاح نص خطوة. c = min(18, R0 / (1.08·rings + 0.5)).
    function layoutChairs(count) {
        var pA = playerAvatarPct();
        var R0 = 50 - pA / 2 - 1.5;
        var positions = [];
        var c = 16;
        if (count === 1) positions.push([50, 50]);
        else if (count > 1) {
            var caps = [], cum = 0;
            for (var k = 1; cum < count; k++) { var cap = Math.floor(6.28 * k); caps.push(cap); cum += cap; }
            c = Math.min(18, R0 / (1.08 * caps.length + 0.5));
            var counts = caps.map(function (cp) { return Math.min(cp, Math.round(count * cp / cum)); });
            var diff = count - counts.reduce(function (a, b) { return a + b; }, 0);
            for (var i = counts.length - 1; diff !== 0; i = (i - 1 + counts.length) % counts.length) {
                if (diff > 0 && counts[i] < caps[i]) { counts[i]++; diff--; }
                else if (diff < 0 && counts[i] > 0) { counts[i]--; diff++; }
            }
            counts.forEach(function (cnt, ri) {
                var r = 1.08 * c * (ri + 1);
                for (var j = 0; j < cnt; j++) {
                    var a = (j + (ri % 2) * 0.5) / cnt * 2 * Math.PI;
                    positions.push([50 + r * Math.sin(a), 50 - r * Math.cos(a)]);
                }
            });
        }
        _chairSize = c;
        return positions;
    }

    // أرقام فريدة عشوائية 1–99 لكل كرسي
    function randomFreeChairNumber(used) {
        var num;
        do { num = 1 + Math.floor(Math.random() * 99); } while (used[num]);
        used[num] = true;
        return num;
    }

    function buildChairs(count) {
        var used = {};
        return layoutChairs(count).map(function (pos) {
            return { number: randomFreeChairNumber(used), x: pos[0], y: pos[1], occupantId: null };
        });
    }

    function renderChairs() {
        var wrap = el('mc-chairs');
        if (!wrap) return;
        var c = _chairSize;
        var numbered = _phase === 'claiming' || _phase === 'out';
        wrap.innerHTML = _chairs.map(function (chair, idx) {
            var cls = 'mc-ch' + (numbered ? ' mc-numbered' : '') + (chair.occupantId && chair.arrived ? ' mc-taken' : '');
            return '<div class="' + cls + '" id="mc-chair-' + idx + '" style="left:' + chair.x + '%;top:' + chair.y + '%;width:' + c + '%;">' +
                '<div class="mc-ch-glyph" style="font-size:' + (c * 0.9) + 'cqw">🪑</div>' +
                '<div class="mc-ch-num" style="font-size:' + (c * 0.36) + 'cqw">' + chair.number + '</div></div>';
        }).join('');
    }

    function renderPlayers() {
        var wrap = el('mc-players');
        if (!wrap) return;
        _pEls = {};
        wrap.innerHTML = '';
        var circle = el('mc-circle');
        if (circle) circle.classList.toggle('mc-no-names', _alive.length > 12);
        _alive.forEach(function (p) {
            var node = document.createElement('div');
            node.className = 'mc-p';
            node.title = playerLabel(p);
            node.innerHTML = '<div class="mc-p-av">' + avatarHtml(p) + '</div>' +
                '<div class="mc-p-name">' + escapeHtml(playerLabel(p)) + '</div>';
            wrap.appendChild(node);
            _pEls[p.id] = node;
        });
        layoutPlayers();
    }

    // مواقع اللاعبين: على حافة الدائرة (موزّعين بالتساوي + زاوية الدوران)،
    // أو بمنتصف الكرسي للي جلس (بحجم 0.85c).
    function layoutPlayers() {
        var N = _alive.length;
        var pA = playerAvatarPct();
        var seatOf = {};
        _chairs.forEach(function (ch, i) { if (ch.occupantId) seatOf[ch.occupantId] = i; });
        _alive.forEach(function (p, j) {
            var node = _pEls[p.id];
            if (!node) return;
            var ci = seatOf[p.id];
            var sat = ci != null;
            var x, y;
            if (sat) { x = _chairs[ci].x; y = _chairs[ci].y; }
            else {
                var a = (j / N * 360 + _angle) * Math.PI / 180;
                x = 50 + 50 * Math.sin(a);
                y = 50 - 50 * Math.cos(a);
            }
            var sz = sat ? _chairSize * 0.85 : pA;
            node.style.left = x + '%';
            node.style.top = y + '%';
            node.classList.toggle('mc-seated', sat);
            var av = node.firstChild;
            av.style.width = sz + 'cqw';
            av.style.fontSize = (sz * 0.36) + 'cqw';
        });
    }

    function renderCenter() {
        var center = el('mc-center');
        if (!center) return;
        if (_phase === 'ended') {
            center.innerHTML = '<div class="mc-ended-title">انتهت المباراة</div>' +
                '<div class="mc-ended-sub">اضغط "مباراة جديدة" للبدء من جديد</div>';
            center.classList.add('mc-show');
        } else {
            center.innerHTML = '';
            center.classList.remove('mc-show');
        }
    }

    function clearCircle() {
        _chairs = [];
        var cw = el('mc-chairs'); if (cw) cw.innerHTML = '';
        var pw = el('mc-players'); if (pw) pw.innerHTML = '';
        _pEls = {};
    }

    // لاعب جديد ينضم أثناء الدورة ← يعاد توزيع الكراسي حسب العدد الجديد
    // (نفس الأرقام وحالة الإشغال للكراسي الموجودة).
    function addChairsIfNeeded() {
        if (!_matchActive || _chairs.length === 0) return;
        var mode = liveSettings().chairDeficitMode || 'auto';
        var targetCount = (mode === 'custom')
            ? Math.max(1, _alive.length - _roundDeficit)
            : Math.max(1, _alive.length - 1);
        if (targetCount <= _chairs.length) return;
        var positions = layoutChairs(targetCount);
        var used = {};
        _chairs.forEach(function (c) { used[c.number] = true; });
        positions.forEach(function (pos, i) {
            if (_chairs[i]) { _chairs[i].x = pos[0]; _chairs[i].y = pos[1]; }
            else _chairs.push({ number: randomFreeChairNumber(used), x: pos[0], y: pos[1], occupantId: null });
        });
        renderChairs();
        layoutPlayers();
        updateBadges();
    }

    /* ======================================================================
     *  6) الدوران — 0.03°/ms × معامل السرعة (بطيء/عادي/سريع)
     * ==================================================================== */
    function startRingLoop() {
        stopRingLoop();
        var last = performance.now();
        var loop = function (t) {
            var d = t - last; last = t;
            _angle = (_angle + d * 0.03 * SPIN_SPEEDS[_spinSpeedIdx].factor) % 360;
            layoutPlayers();
            _raf = window.requestAnimationFrame(loop);
        };
        _raf = window.requestAnimationFrame(loop);
    }

    function stopRingLoop() {
        if (_raf) { window.cancelAnimationFrame(_raf); _raf = null; }
    }

    function handleSpinButtonClick() {
        if (_phase === 'idle') startSpinPhase();
        else if (_phase === 'playing') stopSpinAndReveal();
        else if (_phase === 'out') closeOutModal();
        else if (_phase === 'champion' || _phase === 'ended') restartMatch();
    }

    function startSpinPhase() {
        setPhase('playing');
        startRingLoop();
        startMusic();
        _spinTimeoutId = window.setTimeout(stopSpinAndReveal, spinDuration() * 1000);
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

    // صوت الجلوس: مذبذب مثلثي 520→140Hz خلال 0.18s
    function audioCtx() {
        try { return _ac || (_ac = new (window.AudioContext || window.webkitAudioContext)()); } catch (e) { return null; }
    }
    function playSeatSound() {
        var ac = audioCtx(); var v = _musicMuted ? 0 : _musicVolume;
        if (!ac || !v) return;
        try {
            var t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.18);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
            o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.25);
        } catch (e) {}
    }
    // صوت فتح نافذة الإقصاء: 4 نغمات هابطة 784/587/440/330Hz
    function playOutSound() {
        var ac = audioCtx(); var v = _musicMuted ? 0 : _musicVolume;
        if (!ac || !v) return;
        try {
            [784, 587, 440, 330].forEach(function (f, i) {
                var t = ac.currentTime + i * 0.11, o = ac.createOscillator(), g = ac.createGain();
                o.type = 'sine'; o.frequency.setValueAtTime(f, t);
                g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * v, t + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
                o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.32);
            });
        } catch (e) {}
    }

    function claimChair(player, chairIdx) {
        var chair = _chairs[chairIdx];
        chair.occupantId = player.id;
        _seatedThisRound[player.id] = true;
        layoutPlayers();

        // عند وصول الصورة للكرسي يختفي الكرسي والرقم وتبقى صورة اللاعب
        window.setTimeout(function () {
            chair.arrived = true;
            var chEl = el('mc-chair-' + chairIdx);
            if (chEl && chair.occupantId === player.id) chEl.classList.add('mc-taken');
        }, 600);
        window.setTimeout(playSeatSound, 620);

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
            _roundDeficit = deficit;
            var count = Math.max(1, aliveCount - deficit);
            _customDeficitCurrent = Math.max(1, deficit - 1);
            return count;
        }
        _roundDeficit = 1;
        return Math.max(1, aliveCount - 1);
    }

    // تجهيز الدورة: اللاعبون على الحافة والكراسي فاضية، بانتظار "تدوير"
    function runNextRound() {
        if (!_matchActive) return;
        if (_alive.length <= 1) { showChampion(_alive[0] || null); return; }

        _roundNumber++;
        _seatedThisRound = {};
        _roundLosers = [];
        setPhase('idle');
        _chairs = buildChairs(computeChairCount());
        renderCenter();
        renderChairs();
        renderPlayers();
        updateBadges();
    }

    function stopSpinAndReveal() {
        if (_phase !== 'playing') return;
        if (_spinTimeoutId) { clearTimeout(_spinTimeoutId); _spinTimeoutId = null; }
        stopRingLoop();
        stopMusic();

        setPhase('claiming');
        Array.prototype.forEach.call(el('mc-players').children, function (n) { n.classList.add('mc-moving'); });
        renderChairs();
        playSound('reveal');

        _selectionOpen = true;
        wireCommentListener();
        wireTimerListeners();
        showSeatTimer(seatTime());
        AGP.timerManager.start(TIMER_NAME, seatTime());
    }

    function wireTimerListeners() {
        unwireTimerListeners();
        _timerTickUnsub = AGP.events.on('timer:tick', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            if (_phase === 'claiming') showSeatTimer(payload.remainingSeconds);
            if (payload.remainingSeconds <= 5 && payload.remainingSeconds > 0) playSound('warning');
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

    // انتهاء الجلوس (كل الكراسي انحجزت أو خلصت مهلة الاختيار): اللي بدون
    // كرسي يتلوّن أحمر، وبعد ~1.1 ثانية تفتح نافذة الإقصاء تلقائياً.
    function finishSelectionWindow() {
        if (!_selectionOpen) return;
        _selectionOpen = false;
        unwireCommentListener();
        unwireTimerListeners();

        _roundLosers = _alive.filter(function (p) { return !_seatedThisRound[p.id]; });
        if (_roundLosers.length === 0) { runNextRound(); return; }

        setPhase('out');
        _roundLosers.forEach(function (p) { if (_pEls[p.id]) _pEls[p.id].classList.add('mc-out'); });
        _outTimeoutId = window.setTimeout(showOutModal, 1100);
    }

    function showOutModal() {
        _outTimeoutId = null;
        if (_phase !== 'out') return;
        var remaining = _alive.length - _roundLosers.length;
        el('mc-out-sub').textContent = 'نهاية الدورة ' + _roundNumber + ' · متبقي ' + Math.max(0, remaining) + ' لاعب';
        el('mc-out-list').innerHTML = _roundLosers.map(function (p, i) {
            return '<div class="mc-out-item" style="transition-delay:' + (0.15 + Math.min(i, 12) * 0.05) + 's">' +
                '<div class="mc-out-av">' + avatarHtml(p) + '</div>' +
                '<div class="mc-out-name">' + escapeHtml(playerLabel(p)) + '</div>' +
                '<div class="mc-out-tag">خرج الآن</div></div>';
        }).join('');
        var modal = el('mc-out-modal');
        modal.classList.remove('mc-in');
        modal.classList.add('mc-show');
        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () { modal.classList.add('mc-in'); });
        });
        playOutSound();
    }

    // إغلاق نافذة الإقصاء (✕ / متابعة / الخلفية) يبدأ الدورة الجاية فوراً
    function closeOutModal() {
        closeModal('mc-out-modal');
        if (_phase !== 'out') return;
        if (_outTimeoutId) { clearTimeout(_outTimeoutId); _outTimeoutId = null; }
        _roundLosers.forEach(function (player) {
            var idx = _alive.findIndex(function (p) { return p.id === player.id; });
            if (idx !== -1) _alive.splice(idx, 1);
            _eliminated.push({ player: player, round: _roundNumber });
        });
        _roundLosers = [];
        if (_alive.length <= 1) showChampion(_alive[0] || null);
        else runNextRound();
    }

    // لما يتبقى لاعب واحد تظهر بطاقة الفائز مباشرة (النقاط + الفيديو + البطاقة)
    function showChampion(winner) {
        setPhase('champion');
        clearCircle();
        updateBadges();
        endMatch(winner);
    }

    // ⏹ إنهاء المباراة من نافذة الإعدادات — بدون فائز ولا نقاط
    function endMatchEarly() {
        _matchActive = false;
        if (_spinTimeoutId) { clearTimeout(_spinTimeoutId); _spinTimeoutId = null; }
        if (_outTimeoutId) { clearTimeout(_outTimeoutId); _outTimeoutId = null; }
        stopRingLoop();
        stopMusic();
        _selectionOpen = false;
        unwireCommentListener();
        unwireTimerListeners();
        AGP.timerManager.stop(TIMER_NAME);
        closeModal('mc-out-modal');
        setPhase('ended');
        clearCircle();
        renderCenter();
    }

    // ↺ إعادة اللعبة من البداية / لعبة جديدة — بكل اللاعبين المسجَّلين
    function restartMatch() {
        var overlay = el('agp-shell-overlay');
        var box = el('agp-shell-box');
        if (box && box.classList.contains('mc-winner-screen')) {
            stopWinnerVideo();
            if (overlay) overlay.style.display = 'none';
            box.className = '';
        }
        startMatch(liveSettings());
    }

    /* ======================================================================
     *  10) حذف/انضمام لاعب أثناء المباراة
     * ==================================================================== */
    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id) return;
        var aliveIdx = _alive.findIndex(function (p) { return p.id === removedPlayer.id; });
        if (aliveIdx !== -1) {
            _alive.splice(aliveIdx, 1);
            _chairs.forEach(function (c) { if (c.occupantId === removedPlayer.id) c.occupantId = null; });
            _roundLosers = _roundLosers.filter(function (p) { return p.id !== removedPlayer.id; });
            if (_pEls[removedPlayer.id]) { _pEls[removedPlayer.id].remove(); delete _pEls[removedPlayer.id]; }
            layoutPlayers();
            updateBadges();
            if (_matchActive && _alive.length <= 1) {
                window.setTimeout(function () { showChampion(_alive[0] || null); }, 400);
            }
        }
        var elimIdx = _eliminated.findIndex(function (e) { return e.player.id === removedPlayer.id; });
        if (elimIdx !== -1) _eliminated.splice(elimIdx, 1);
        renderJoinPanel();
    }

    // لاعب جديد يظهر على حافة الدائرة فوراً وقت انضمامه
    function handlePlayerJoined(newPlayer) {
        if (!_matchActive || !newPlayer || !newPlayer.id) return;
        var already = _alive.some(function (p) { return p.id === newPlayer.id; }) ||
            _eliminated.some(function (e) { return e.player.id === newPlayer.id; });
        if (already) return;
        _alive.push(newPlayer);
        renderPlayers();
        if (_phase === 'claiming' || _phase === 'out') {
            Array.prototype.forEach.call(el('mc-players').children, function (n) { n.classList.add('mc-moving'); });
        }
        addChairsIfNeeded();
        updateBadges();
        renderJoinPanel();
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
        renderJoinPanel();
    }

    /* ======================================================================
     *  11) بدء المباراة (onStartRound من الشل)
     * ==================================================================== */
    function startMatch(settingsValues) {
        resetMatchState();
        _settings = settingsValues;
        _alive = AGP.gameManager.getPlayers().slice();
        _customDeficitCurrent = settingsValues.customDeficitStart || 5;
        _startedAt = Date.now();
        _matchActive = true;

        ensureScaffolding();
        runNextRound();
    }

    function handleStartRound(settingsValues) {
        startMatch(settingsValues);
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
        pointsPromise.then(function (pointsResult) {
            if (_phase === 'champion') renderWinnerScreen(winner, pointsResult);
        });
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
            startMatch(liveSettings());
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
        var cards = root.querySelectorAll('.agp-shell-player-list .agp-pcard-tpl:not([data-mc-fit]),#mc-join-list .agp-pcard-tpl:not([data-mc-fit])');
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

    AGP.events.on('platform:ready', function () { registerGame(); });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
